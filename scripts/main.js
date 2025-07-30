//--------------------------------------------------------------
// Created by https://peakd.com/@gadrian with the support of AI.
//--------------------------------------------------------------

import {showStatus, clearStatus, readJSONFile, validateSnapshotConsistency, removeDuplicateSnapshots,
        extractDataForCategory, filterUnrealisticDrops, resetDashboardToDefaults,
        getPriceInfo, getTokenPriceInfo, getDieselPoolInfo, getTokenQuantity, getPoolShares} from './helper-functions.js';

export class HivePortfolioCharter {
    constructor() {
        this.rawData = [];
        this.charts = {};
        this.availableTokens = new Set();
        this.availablePools = new Set();

        // Create tooltip once and store on instance
        this.tooltip = d3.select("body").select(".tooltip");

        if (this.tooltip.empty()) {
            this.tooltip = d3.select("body").append("div")
                .attr("class", "tooltip")
                .style("position", "absolute")
                .style("z-index", "9999")
                .style("padding", "12px")
                .style("background", "rgba(0, 0, 0, 0.9)")
                .style("color", "white")
                .style("border-radius", "6px")
                .style("pointer-events", "none")
                .style("font-size", "13px")
                .style("line-height", "1.4")
                .style("box-shadow", "0 4px 12px rgba(0,0,0,0.3)")
                .style("max-width", "300px")
                .style("opacity", 0);
        }

        this.initializeEventListeners();
        this.initializeCharts();
    }
    destroy() {
        this.tooltip.remove();
    }

    initializeEventListeners() {
        document.getElementById('fileInput').addEventListener('change', (e) => this.handleFileInput(e));
        document.getElementById('snapshotType').addEventListener('change', () => this.updateCharts());
        document.getElementById('dataCategory').addEventListener('change', () => this.handleCategoryChange());
        document.getElementById('specificItem').addEventListener('change', () => this.updateCharts());
        document.getElementById('dateStart').addEventListener('change', () => this.updateCharts());
        document.getElementById('dateEnd').addEventListener('change', () => this.updateCharts());
        document.getElementById('clearData').addEventListener('click', () => this.handleClearData());
    }

    initializeCharts() {
        const chartIds = ['usdChart', 'hiveChart', 'btcChart'];
        const currencies = ['USD', 'HIVE', 'BTC'];
        const colors = ['#2563eb', '#dc2626', '#f59e0b'];

        chartIds.forEach((id, index) => {
            this.charts[id] = {
                currency: currencies[index],
                color: colors[index],
                container: d3.select(`#${id}`)
            };
            this.setupChart(id);
        });
    }

    setupChart(chartId) {
        const container = this.charts[chartId].container;
        const margin = { top: 20, right: 30, bottom: 80, left: 100 };
        const containerWidth = container.node().clientWidth || 800;
        const width = containerWidth - margin.left - margin.right;
        const height = 350 - margin.top - margin.bottom;

        // Clear any existing content
        container.selectAll("*").remove();

        const svg = container
            .append("svg")
            .attr("width", containerWidth)
            .attr("height", 350)
            .attr("viewBox", `0 0 ${containerWidth} 350`)
            .style("max-width", "100%")
            .style("height", "auto");

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Store dimensions and elements for later use
        this.charts[chartId].svg = svg;
        this.charts[chartId].g = g;
        this.charts[chartId].width = width;
        this.charts[chartId].height = height;
        this.charts[chartId].margin = margin;
    }

    async handleFileInput(event) {
        const files = Array.from(event.target.files);
        if (files.length === 0) return;

        showStatus('Loading files...', 'info');

        try {
            const filePromises = files.map(file => readJSONFile(file));
            const results = await Promise.all(filePromises);

            const validSnapshots = results.filter(result => result !== null);
            
            if (validSnapshots.length === 0) {
                showStatus('No valid JSON files found', 'error');
                return;
            }

            // How many snapshots we had before?
            const oldSnapshotsTotal = this.rawData.length;

            // Combine existing data with new snapshots
            const allSnapshots = [...this.rawData, ...validSnapshots];

            // Validate account and snapshot type consistency for all data
            const validationResult = validateSnapshotConsistency(allSnapshots);
            if (!validationResult.isValid) {
                showStatus(validationResult.message, 'error');
                return;
            }

            // Remove duplicates based on timestamp and account (optional)
            const uniqueSnapshots = removeDuplicateSnapshots(allSnapshots);

            // Update rawData with the combined and sorted data
            this.rawData = uniqueSnapshots
                .sort((a, b) => new Date(a.metadata.snapshot_timestamp) - new Date(b.metadata.snapshot_timestamp));

            this.extractAvailableItems();
            this.updateSpecificItemDropdown();
            this.setDateRange();
            this.updateCharts();

            const uniqueSnapshotsAdded = this.rawData.length - oldSnapshotsTotal;

            const accounts = [...new Set(this.rawData.map(s => s.metadata.account))];
            const snapshotTypes = [...new Set(this.rawData.map(s => s.metadata.snapshot_type))];
            if (uniqueSnapshotsAdded > 0)
                showStatus(`Successfully loaded ${uniqueSnapshotsAdded} new snapshots. Total: ${this.rawData.length} snapshots for account(s): ${accounts.join(', ')} (Types: ${snapshotTypes.join(', ')})`, 'success');
            else
                showStatus(`No new snapshots were added (already loaded previously). Total: ${this.rawData.length} snapshots for account(s): ${accounts.join(', ')} (Types: ${snapshotTypes.join(', ')})`, 'success');
        } catch (error) {
            showStatus(`Error loading files: ${error.message}`, 'error');
        }
    }

    extractAvailableItems() {
        this.availableTokens.clear();
        this.availablePools.clear();

        this.rawData.forEach(snapshot => {
            if (snapshot.layer1_holdings) {
                Object.keys(snapshot.layer1_holdings).forEach(key => {
                    if (key !== 'totals') {
                        this.availableTokens.add(`L1:${key}`);
                    }
                });
            }

            if (snapshot.tokens) {
                Object.keys(snapshot.tokens).forEach(token => {
                    this.availableTokens.add(`TOKEN:${token}`);
                });
            }

            if (snapshot.diesel_pools) {
                Object.keys(snapshot.diesel_pools).forEach(pool => {
                    this.availablePools.add(pool);
                });
            }
        });
    }

    updateSpecificItemDropdown() {
        const dropdown = document.getElementById('specificItem');
        const category = document.getElementById('dataCategory').value;

        dropdown.innerHTML = '<option value="">Select item...</option>';

        if (category === 'specific_token') {
            this.availableTokens.forEach(token => {
                const option = document.createElement('option');
                option.value = token;
                option.textContent = token.replace('L1:', '').replace('TOKEN:', '');
                dropdown.appendChild(option);
            });
            dropdown.disabled = false;
        } else if (category === 'specific_pool') {
            this.availablePools.forEach(pool => {
                const option = document.createElement('option');
                option.value = pool;
                option.textContent = pool;
                dropdown.appendChild(option);
            });
            dropdown.disabled = false;
        } else {
            dropdown.disabled = true;
        }
    }

    handleCategoryChange() {
        this.updateSpecificItemDropdown();
        this.updateCharts();
    }

    //removing loaded snapshots from memory, and re-initialitations
    handleClearData() {
        if (this.rawData.length === 0) {
            showStatus('No data to clear', 'info');
            return;
        }

        const confirmed = confirm(`Are you sure you want to clear all data? This will remove ${this.rawData.length} snapshots from memory and you'll need to load them again if you want them back.`);
        
        if (confirmed) {
            // Clear all data
            this.rawData = [];
            this.availableTokens.clear();
            this.availablePools.clear();
            
            // Reset UI elements
            document.getElementById('specificItem').innerHTML = '<option value="">Select item...</option>';
            document.getElementById('specificItem').disabled = true;
            document.getElementById('dateStart').value = '';
            document.getElementById('dateEnd').value = '';
            document.getElementById('fileInput').value = '';
            
            // Clear all charts
            Object.keys(this.charts).forEach(chartId => {
                this.charts[chartId].g.selectAll("*").remove();
            });
            
            // Clear status and show confirmation
            clearStatus();
            showStatus('All data cleared successfully', 'success');
            
            // Reset dashboard to default values
            resetDashboardToDefaults();
        }
    }

    setDateRange() {
        if (this.rawData.length === 0) return;

        const startDate = new Date(this.rawData[0].metadata.snapshot_timestamp);
        const endDate = new Date(this.rawData[this.rawData.length - 1].metadata.snapshot_timestamp);

        document.getElementById('dateStart').value = startDate.toISOString().split('T')[0];
        document.getElementById('dateEnd').value = endDate.toISOString().split('T')[0];
    }

    filterDataByDateRange() {
        const startDate = new Date(document.getElementById('dateStart').value);
        const endDate = new Date(document.getElementById('dateEnd').value);
        
        // Set end date to end of day to include the entire end date
        endDate.setHours(23, 59, 59, 999);

        return this.rawData.filter(snapshot => {
            const snapshotDate = new Date(snapshot.metadata.snapshot_timestamp);
            return snapshotDate >= startDate && snapshotDate <= endDate;
        });
    }

    // calculates the ratio between currencies at a reference point and creates proportional Y-axis domains for all three charts
    calculateSynchronizedScales(data) {
        if (data.length === 0) return null;

        // Find min/max values for each currency
        const usdValues = data.map(d => d.usd);
        const hiveValues = data.map(d => d.hive);
        const btcValues = data.map(d => d.btc);

        const usdMin = Math.min(...usdValues);
        const usdMax = Math.max(...usdValues);
        const hiveMin = Math.min(...hiveValues);
        const hiveMax = Math.max(...hiveValues);
        const btcMin = Math.min(...btcValues);
        const btcMax = Math.max(...btcValues);

        // Calculate ranges for each currency
        const usdRange = usdMax - usdMin;
        const hiveRange = hiveMax - hiveMin;
        const btcRange = btcMax - btcMin;

        // Get price ratios from the latest data point to convert all ranges to USD equivalent
        const latestData = data[data.length - 1];
        let hiveToUsdRatio = 1;
        let btcToUsdRatio = 1;
        
        // Extract price information from snapshots metadata
        if (latestData.snapshots && latestData.snapshots.length > 0) {
            const snapshot = latestData.snapshots[0];
            const prices = snapshot.metadata?.prices;
            
            if (prices) {
                if (prices.hive_usd && prices.hive_usd > 0) {
                    hiveToUsdRatio = prices.hive_usd;
                }
                if (prices.btc_usd && prices.btc_usd > 0) {
                    btcToUsdRatio = prices.btc_usd;
                }
            }
        }
        
        // If we don't have price data, estimate ratios from the portfolio values
        if (hiveToUsdRatio === 1 || btcToUsdRatio === 1) {
            // Find a data point where all three currencies have non-zero values
            for (const dataPoint of data) {
                if (dataPoint.usd > 0 && dataPoint.hive > 0 && dataPoint.btc > 0) {
                    if (hiveToUsdRatio === 1) {
                        hiveToUsdRatio = dataPoint.usd / dataPoint.hive;
                    }
                    if (btcToUsdRatio === 1) {
                        btcToUsdRatio = dataPoint.usd / dataPoint.btc;
                    }
                    break;
                }
            }
        }

        // Convert all ranges to USD equivalent for comparison
        const usdEquivalentRanges = {
            usd: usdRange,
            hive: hiveRange * hiveToUsdRatio,
            btc: btcRange * btcToUsdRatio
        };

        // Find which currency has the widest fluctuation range in USD equivalent
        let baseCurrency, baseMin, baseMax, baseRange;
        
        if (usdEquivalentRanges.usd >= usdEquivalentRanges.hive && usdEquivalentRanges.usd >= usdEquivalentRanges.btc) {
            baseCurrency = 'usd';
            baseMin = usdMin;
            baseMax = usdMax;
            baseRange = usdRange;
        } else if (usdEquivalentRanges.hive >= usdEquivalentRanges.btc) {
            baseCurrency = 'hive';
            baseMin = hiveMin;
            baseMax = hiveMax;
            baseRange = hiveRange;
        } else {
            baseCurrency = 'btc';
            baseMin = btcMin;
            baseMax = btcMax;
            baseRange = btcRange;
        }

        // Add padding to the base range
        const padding = baseRange * 0.1;
        let baseDomainMin = baseMin - padding;
        let baseDomainMax = baseMax + padding;

        // Handle special cases for base currency
        if (baseMin >= 0 && baseMin < baseMax * 0.1) {
            baseDomainMin = 0;
        }

        if (baseMin === baseMax) {
            const centerValue = baseMin;
            const range = Math.max(Math.abs(centerValue) * 0.1, 1);
            baseDomainMin = centerValue - range;
            baseDomainMax = centerValue + range;
        }

        const baseDomainRange = baseDomainMax - baseDomainMin;

        // For non-base currencies, center them within the same visual range
        const result = {};

        ['usd', 'hive', 'btc'].forEach(currency => {
            if (currency === baseCurrency) {
                // Base currency uses its calculated domain
                result[currency] = { min: baseDomainMin, max: baseDomainMax };
            } else {
                // Other currencies are centered within the same visual range
                const currMin = currency === 'usd' ? usdMin : (currency === 'hive' ? hiveMin : btcMin);
                const currMax = currency === 'usd' ? usdMax : (currency === 'hive' ? hiveMax : btcMax);
                const currRange = currMax - currMin;
                
                if (currRange === 0) {
                    // Handle flat line case - center the value
                    const centerValue = currMin;
                    const halfRange = baseDomainRange / 2;
                    result[currency] = {
                        min: centerValue - halfRange,
                        max: centerValue + halfRange
                    };
                } else {
                    // Center the currency's range within the base domain range
                    const currCenter = (currMin + currMax) / 2;
                    
                    // Calculate how much visual space this currency should get relative to the base currency
                    // Convert the base domain range to this currency's equivalent
                    let targetRangeInCurrency;
                    if (baseCurrency === 'usd') {
                        if (currency === 'hive') {
                            targetRangeInCurrency = baseDomainRange / hiveToUsdRatio;
                        } else { // btc
                            targetRangeInCurrency = baseDomainRange / btcToUsdRatio;
                        }
                    } else if (baseCurrency === 'hive') {
                        if (currency === 'usd') {
                            targetRangeInCurrency = baseDomainRange * hiveToUsdRatio;
                        } else { // btc
                            targetRangeInCurrency = baseDomainRange * hiveToUsdRatio / btcToUsdRatio;
                        }
                    } else { // baseCurrency === 'btc'
                        if (currency === 'usd') {
                            targetRangeInCurrency = baseDomainRange * btcToUsdRatio;
                        } else { // hive
                            targetRangeInCurrency = baseDomainRange * btcToUsdRatio / hiveToUsdRatio;
                        }
                    }
                    
                    const halfTargetRange = targetRangeInCurrency / 2;
                    
                    result[currency] = {
                        min: currCenter - halfTargetRange,
                        max: currCenter + halfTargetRange
                    };
                }
            }
        });

        return result;
    }

    updateCharts() {
        if (this.rawData.length === 0) return;

        // Clear any previous filtering status messages
        console.clear();

        // Clear status messages when updating charts
        clearStatus();

        const filteredData = this.filterDataByDateRange();
        const snapshotType = document.getElementById('snapshotType').value;
        const category = document.getElementById('dataCategory').value;
        const specificItem = document.getElementById('specificItem').value;

        const typeFilteredData = filteredData.filter(snapshot =>
            snapshot.metadata.snapshot_type === snapshotType
        );

        // Create a map to handle duplicate dates by keeping the latest snapshot
        const dateMap = new Map();
        typeFilteredData.forEach(snapshot => {
            const parsedDate = new Date(snapshot?.metadata?.snapshot_timestamp);
            
            if (!isNaN(parsedDate)) {
                const dateKey = parsedDate.toDateString();
                
                if (!dateMap.has(dateKey)) {
                    dateMap.set(dateKey, []);
                }
                dateMap.get(dateKey).push(snapshot);
            }
        });

        // Convert map to array, sum values for each date, and sort by date
        let chartData = Array.from(dateMap.entries()).map(([dateKey, snapshots]) => {
            const date = new Date(dateKey);
            const values = extractDataForCategory(snapshots, category, specificItem);
            
            return {
                date: date,
                originalDate: date,
                usd: values.usd || 0,
                hive: values.hive || 0,
                btc: values.btc || 0,
                snapshots: snapshots // Store all snapshots for this date
            };
        }).sort((a, b) => a.date - b.date);

        // Apply unrealistic drop filtering (this resets for each new selection)
        chartData = filterUnrealisticDrops(chartData, snapshotType, category);

        // Calculate synchronized scales for all charts
        const synchronizedScales = this.calculateSynchronizedScales(chartData);

        // Update each chart with synchronized scales
        Object.keys(this.charts).forEach(chartId => {
            const currency = this.charts[chartId].currency.toLowerCase();
            this.updateChart(chartId, chartData, currency, synchronizedScales);
        });

        // Update dashboard
        this.updateDashboard(chartData, snapshotType, category, specificItem);
    }

    updateChart(chartId, data, currency, synchronizedScales = null) {
        const chart = this.charts[chartId];
        const g = chart.g;
        const width = chart.width;
        const height = chart.height;
        const color = chart.color;

        // Clear previous content
        g.selectAll("*").remove();

        if (data.length === 0) {
            // Show "No data" message
            g.append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .style("font-size", "16px")
                .style("fill", "#666")
                .text("No data available");
            return;
        }

        // Prepare data for this currency
        const chartData = data.map(d => ({
            date: d.date,
            value: d[currency],
            snapshots: d.snapshots
        }));

        // Create x-scale
        let xScale;
        if (chartData.length === 1) {
            const singleDate = chartData[0].date;
            const pad = 1000 * 60 * 60 * 12; // 12 hours padding
            xScale = d3.scaleTime()
                .domain([new Date(singleDate.getTime() - pad), new Date(singleDate.getTime() + pad)])
                .range([0, width]);
        } else {
            xScale = d3.scaleTime()
                .domain(d3.extent(chartData, d => d.date))
                .range([0, width]);
        }

        // Create Y-scale - use synchronized scales if available
        let yScale;
        if (synchronizedScales && synchronizedScales[currency]) {
            yScale = d3.scaleLinear()
                .domain([synchronizedScales[currency].min, synchronizedScales[currency].max])
                .range([height, 0]);
        } else {
            // Fallback to original Y-scale calculation
            const values = chartData.map(d => d.value);
            const minValue = Math.min(...values);
            const maxValue = Math.max(...values);
            
            if (minValue === maxValue) {
                const centerValue = minValue;
                const range = Math.max(Math.abs(centerValue) * 0.1, 1);
                yScale = d3.scaleLinear()
                    .domain([centerValue - range, centerValue + range])
                    .range([height, 0]);
            } else {
                const range = maxValue - minValue;
                const padding = range * 0.1;
                
                let domainMin = minValue - padding;
                let domainMax = maxValue + padding;
                
                if (minValue >= 0 && minValue < maxValue * 0.1) {
                    domainMin = 0;
                }
                
                yScale = d3.scaleLinear()
                    .domain([domainMin, domainMax])
                    .range([height, 0]);
            }
        }

        // Create axes
        let xAxis;
        if (chartData.length <= 8) {
            xAxis = d3.axisBottom(xScale)
                .tickFormat(d3.timeFormat("%d %b %y"))
                .tickValues(chartData.map(d => d.date))  // Force exact dates
        } else {
            xAxis = d3.axisBottom(xScale)
            .ticks(5)
            .tickFormat(d3.timeFormat('%d %b %y'));
        }

        const yAxis = d3.axisLeft(yScale)
            .ticks(5)
            .tickFormat(d => {
                if (currency === 'usd') return '$' + d3.format(",.2f")(d);
                if (currency === 'hive') return d3.format(",.3f")(d) + ' HIVE';
                if (currency === 'btc') return d3.format(",.8f")(d) + ' BTC';
                return d3.format(",")(d);
            });

        // Add grid lines first (so they appear behind the data)
        g.append("g")
            .attr("class", "grid")
            .attr("transform", `translate(0,${height})`)
            .style("stroke-dasharray", "3,3")
            .style("opacity", 0.3)
            .call(d3.axisBottom(xScale)
                .tickSize(-height)
                .tickFormat("")
            );

        g.append("g")
            .attr("class", "grid")
            .style("stroke-dasharray", "3,3")
            .style("opacity", 0.3)
            .call(d3.axisLeft(yScale)
                .tickSize(-width)
                .tickFormat("")
            );

        // Add axes
        g.append("g")
            .attr("class", "axis")
            .attr("transform", `translate(0,${height})`)
            .call(xAxis)
            .selectAll("text")
            .style("text-anchor", "end")
            .attr("dx", "-.6em")
            .attr("dy", ".15em")
            .attr("transform", "rotate(-45)");

        g.append("g")
            .attr("class", "axis")
            .call(yAxis);

        // Add line (if more than 1 point)
        if (chartData.length > 1) {
            const line = d3.line()
                .x(d => xScale(d.date))
                .y(d => yScale(d.value))
                .curve(d3.curveMonotoneX);

            g.append("path")
                .datum(chartData)
                .attr("fill", "none")
                .attr("stroke", color)
                .attr("stroke-width", 2)
                .attr("d", line);
        }

        const self = this; //capture class context;

        let radius = 5;

        if (chartData.length > 180)
            radius = 1;
        else if (chartData.length > 60)
            radius = 2;
        else if (chartData.length > 30)
            radius = 3;
        else if (chartData.length > 5)
            radius = 4;

        // Add points
        g.selectAll(".dot")
        .data(chartData)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yScale(d.value))
        .attr("r", radius)
        .style("fill", color)
        .style("stroke", "#fff")
        .style("stroke-width", 2)
        .on("mouseover", function(event, d) {
            self.tooltip.transition()
                .duration(200)
                .style("opacity", .9);

            let valueStr;
            if (currency === 'usd') valueStr = '$' + d3.format(",.2f")(d.value);
            else if (currency === 'hive') valueStr = d3.format(",.3f")(d.value) + ' HIVE';
            else if (currency === 'btc') valueStr = d3.format(",.8f")(d.value) + ' BTC';
            else valueStr = d3.format(",")(d.value);

            // Build tooltip content
            let tooltipContent = `<strong>${d3.timeFormat('%d %b %Y')(d.date)}</strong><br/>`;
            tooltipContent += `<strong>${valueStr}</strong>`;
            
            // Add price information for HIVE and BTC charts
            if (currency === 'hive' || currency === 'btc') {
                const priceInfo = getPriceInfo(d, currency);
                if (priceInfo) {
                    tooltipContent += `<br/><em>${priceInfo}</em>`;
                }
            }
            
            // Add quantity information for specific tokens and pools
            const category = document.getElementById('dataCategory').value;
            const specificItem = document.getElementById('specificItem').value;
            
            if (category === 'specific_token' && specificItem) {
                const quantityInfo = getTokenQuantity(d, specificItem);
                if (quantityInfo) {
                    tooltipContent += `<br/><span style="color: #90EE90;">${quantityInfo}</span>`;
                }
                
                // Add token price information
                const tokenPriceInfo = getTokenPriceInfo(d, specificItem, currency);
                if (tokenPriceInfo) {
                    tooltipContent += `<br/><span style="color: #FFD700;">${tokenPriceInfo}</span>`;
                }
            } else if (category === 'specific_pool' && specificItem) {
                const sharesInfo = getPoolShares(d, specificItem);
                if (sharesInfo) {
                    tooltipContent += `<br/><span style="color: #87CEEB;">${sharesInfo}</span>`;
                }
                
                // Add diesel pool component information
                const poolInfo = getDieselPoolInfo(d, specificItem);
                if (poolInfo) {
                    tooltipContent += `<br/><span style="color: #DDA0DD;">${poolInfo}</span>`;
                }
            }

            self.tooltip.html(tooltipContent)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            self.tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        });
    }
}
