//--------------------------------------------------------------
// Created by https://peakd.com/@gadrian with the support of AI.
//--------------------------------------------------------------

import { calculateMaxLeftLabelWidth, calculateMaxLabelWidth, calculateOptimalDecimalPlacesRightYaxis,
         createSecondaryYScale, createXScale, createYScale, addGridLines, addAxes, addLineAndPoints,
         generateTooltipContent, generateSecondaryTooltipContent, updateSecondaryChartLabel, ensurePrimaryChartOnTop } from './charts.js';

import { showStatus, clearStatus, readJSONFile, validateSnapshotConsistency, removeDuplicateSnapshots,
         extractDataForCategory, filterUnrealisticDrops, resetDashboardToDefaults,
         getAmountData, getPriceData } from './helper-functions.js';

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
        document.getElementById('chartsType').addEventListener('change', () => this.handleChartsTypeChange());
        document.getElementById('clearData').addEventListener('click', () => this.handleClearData());
        
        // Improved resize handling with debouncing
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.handleResize();
            }, 150); // Debounce resize events
        });
    }
    
    // Properly handle window resize
    handleResize() {
        // Add debouncing flag to prevent multiple simultaneous resize operations
        if (this.isResizing) return;
        this.isResizing = true;
        
        setTimeout(() => {
            // Force recalculation of all chart dimensions with current viewport
            Object.keys(this.charts).forEach(chartId => {
                // Reset margins to allow fresh calculation
                this.setupChart(chartId, 80, 80);
            });
            
            // Update charts with fresh dimensions
            this.updateCharts();
            
            this.isResizing = false;
        }, 100);
    }

    initializeCharts() {
        const chartIds = ['usdChart', 'hiveChart', 'btcChart'];
        const currencies = ['USD', 'HIVE', 'BTC'];
        const colors = ['#2563eb', '#dc2626', '#f59e0b'];
        const complementColors = ['#10b981', '#7c3aed', '#0ea5e9'];

        chartIds.forEach((id, index) => {
            this.charts[id] = {
                currency: currencies[index],
                color: colors[index],
                secondaryColor: complementColors[index],
                container: d3.select(`#${id}`)
            };
            this.setupChart(id);
            const data = [];
            this.updateChart(id, data, currencies[index]);
        });
    }

    setupChart(chartId, suggestedLeftMargin = 80, suggestedRightMargin = 80) {
        const container = this.charts[chartId].container;
        
        // Get viewport width for mobile detection
        const viewportWidth = window.innerWidth;
        console.log(viewportWidth);
        const isMobile = viewportWidth <= 768;
        const isVerySmall = viewportWidth <= 480;
        
        // Get the actual current width of the container
        const containerRect = container.node().getBoundingClientRect();
        let containerWidth = containerRect.width;
        
        // Handle cases where container width is 0 or not available
        if (!containerWidth || containerWidth === 0) {
            containerWidth = viewportWidth > 768 ? 800 : Math.min(viewportWidth - 40, 400);
        }
        
        // Set mobile-friendly minimum widths
        let minWidth;
        if (isVerySmall) {
            minWidth = Math.min(280, viewportWidth - 40); // Leave 20px padding on each side
        } else if (isMobile) {
            minWidth = Math.min(320, viewportWidth - 40);
        } else {
            minWidth = 400;
        }
        
        containerWidth = Math.max(containerWidth, minWidth);
        
        // Adjust margins for mobile
        let leftMargin, rightMargin;
        
        if (isVerySmall) {
            leftMargin = Math.min(50, Math.max(35, suggestedLeftMargin * 0.6));
            rightMargin = Math.min(50, Math.max(35, suggestedRightMargin * 0.6));
        } else if (isMobile) {
            leftMargin = Math.min(70, Math.max(45, suggestedLeftMargin * 0.8));
            rightMargin = Math.min(70, Math.max(45, suggestedRightMargin * 0.8));
        } else {
            leftMargin = Math.min(120, Math.max(60, suggestedLeftMargin));
            rightMargin = Math.min(120, Math.max(60, suggestedRightMargin));
        }
        
        const margin = { 
            top: 20, 
            right: rightMargin,
            bottom: isMobile ? 60 : 80, // Reduce bottom margin on mobile
            left: leftMargin
        };
        
        const containerHeight = isMobile ? 280 : 350; // Slightly reduce height on mobile
        
        const width = containerWidth - margin.left - margin.right;
        const height = containerHeight - margin.top - margin.bottom;

        // Ensure minimum chart area
        if (width < 150 || height < 100) {
            console.warn(`Chart ${chartId} dimensions too small: ${width}x${height}`);
            // Use absolute minimum margins if chart area is too small
            margin.left = 30;
            margin.right = 30;
            margin.bottom = 40;
        }

        // Clear any existing content
        container.selectAll("*").remove();

        const svg = container
            .append("svg")
            .attr("width", containerWidth)
            .attr("height", containerHeight)
            .style("width", "100%")
            .style("height", "auto")
            .style("max-width", "100%")
            .style("display", "block"); // Ensure proper display

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left},${margin.top})`);

        // Store dimensions and elements for later use
        this.charts[chartId].svg = svg;
        this.charts[chartId].g = g;
        this.charts[chartId].width = Math.max(width, 150); // Ensure minimum width
        this.charts[chartId].height = Math.max(height, 100); // Ensure minimum height
        this.charts[chartId].margin = margin;
        this.charts[chartId].containerWidth = containerWidth;
        this.charts[chartId].containerHeight = containerHeight;
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

    handleChartsTypeChange() {
        const chartsType = document.getElementById('chartsType').value;
        const category = document.getElementById('dataCategory').value;
        const specificItem = document.getElementById('specificItem').value;
        if (chartsType ==='value_amount' || chartsType ==='value_price' && category === 'specific_token' || category === 'specific_pool') {
            if (chartsType ==='value_amount')
                if (category === 'specific_token')
                    updateSecondaryChartLabel('amount', {token: specificItem});
                else if (category === 'specific_pool')
                    updateSecondaryChartLabel('shares', {diesel_pool: specificItem});
                else updateSecondaryChartLabel('');
            else if (chartsType ==='value_price')
                if (category === 'specific_token')
                    updateSecondaryChartLabel('price', {token: specificItem});
                else updateSecondaryChartLabel('');
        }
        else updateSecondaryChartLabel('');
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
                this.updateChart(chartId, this.rawData, this.charts[chartId].currency.toLowerCase());
            });

            updateSecondaryChartLabel('');
            
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
        if (this.rawData.length === 0) {
            Object.keys(this.charts).forEach(chartId => {
                const currency = this.charts[chartId].currency.toLowerCase();
                this.updateChart(chartId, this.rawData, currency);
            });
            return;
        }
        
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

    updateChart(chartId, data, currency, synchronizedScales = null, recursionDepth = 0) {
        const chart = this.charts[chartId];
        const g = chart.g;
        let { width, height } = chart;
        const color = chart.color;
        
        // Prevent infinite recursion
        if (recursionDepth > 5) {
            console.warn(`Maximum recursion depth reached for chart ${chartId}.`);
            return;
        }

        // Get chart type and specific item
        const chartsType = document.getElementById('chartsType').value;
        const category = document.getElementById('dataCategory').value;
        const specificItem = document.getElementById('specificItem').value;

        // Clear previous content
        g.selectAll("*").remove();

        if (!data || data.length === 0) {
            g.append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .style("font-size", "16px")
                .style("fill", "#666")
                .text("No snapshots loaded");
            return;
        }
        
        if ((category === 'specific_token' || category === 'specific_pool') && !specificItem) {
            g.append("text")
                .attr("x", width / 2)
                .attr("y", height / 2)
                .attr("text-anchor", "middle")
                .style("font-size", "16px")
                .style("fill", "#666")
                .text("Select specific item!");
            return;
        }       

        // Prepare primary data (value)
        const chartData = data.map(d => ({
            date: d.date,
            value: d[currency],
            snapshots: d.snapshots
        }));

        // Prepare secondary data based on chartsType
        let secondaryData = null;
        let secondaryColor = chart.secondaryColor;

        if (chartsType !== 'value_only' && specificItem) {
            if (chartsType === 'value_amount' && (category === 'specific_token' || category === 'specific_pool')) {
                // Extract amount data
                secondaryData = data.map(d => {
                    const amount = getAmountData(d, specificItem, category);
                    return {
                        date: d.date,
                        value: amount || 0,
                        snapshots: d.snapshots
                    };
                });
                if (category === 'specific_token')
                    updateSecondaryChartLabel('amount', {token: specificItem});
                else updateSecondaryChartLabel('shares', {diesel_pool: specificItem});
            } else if (chartsType === 'value_price' && category === 'specific_token') {
                // Extract price data
                secondaryData = data.map(d => {
                    const price = getPriceData(d, specificItem, currency);
                    return {
                        date: d.date,
                        value: price || 0,
                        snapshots: d.snapshots
                    };
                });
                updateSecondaryChartLabel('price', {token: specificItem});            }
        }

        // Create scales
        const xScale = createXScale(chartData, width);
        const yScaleLeft = createYScale(chartData, height, synchronizedScales, currency);
        
        let yScaleRight = null;
        if (secondaryData) {
            yScaleRight = createSecondaryYScale(secondaryData, height);
        }
        
        let needsMarginAdjustment = false;
        let suggestedLeftMargin = 80;
        
        const maxLeftLabelWidth = calculateMaxLeftLabelWidth(yScaleLeft, currency);
        suggestedLeftMargin = Math.max(60, maxLeftLabelWidth + 10);

        const currentLeftMargin = chart.margin.left;

        let suggestedRightMargin = 80;
        
        if (yScaleRight) {
            const [minValue, maxValue] = yScaleRight.domain();
            
            // Use the same calculation logic as in addAxes
            const decimalPlaces = calculateOptimalDecimalPlacesRightYaxis(minValue, maxValue, currency, chartsType, category, specificItem);
            const maxLabelWidth = calculateMaxLabelWidth(yScaleRight, decimalPlaces, currency, chartsType);
            suggestedRightMargin = Math.max(60, maxLabelWidth + 10);
        }
        const currentRightMargin = chart.margin.right;
        
        // Check if we need significant margin adjustment
        if (Math.abs(currentRightMargin - suggestedRightMargin) > 20 || 
            Math.abs(currentLeftMargin - suggestedLeftMargin) > 20) {
            needsMarginAdjustment = true;
        }

        // If we need margin adjustment, re-setup the chart and restart
        if (needsMarginAdjustment && recursionDepth < 3) {
            this.setupChart(chartId, suggestedLeftMargin, suggestedRightMargin);
            // Recursively call updateChart with the new dimensions
            this.updateChart(chartId, data, currency, synchronizedScales, recursionDepth + 1);
            return;
        }
        
        // Update width and height after potential margin changes
        width = chart.width;
        height = chart.height;

        // Add all axes
        addAxes(g, xScale, yScaleLeft, yScaleRight, chartData, currency, width, height);

        // Add grid lines
        addGridLines(g, xScale, yScaleLeft, width, height);

        // Add primary line and points
        addLineAndPoints(this, g, chartData, xScale, yScaleLeft, color, currency, 'primary');

        // Add secondary line and points if exists
        if (secondaryData && yScaleRight) {
            addLineAndPoints(this, g, secondaryData, xScale, yScaleRight, secondaryColor, currency, 'secondary');
        }
        
        ensurePrimaryChartOnTop(g);
    }
}
