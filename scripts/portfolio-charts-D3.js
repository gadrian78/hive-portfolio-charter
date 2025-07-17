//--------------------------------------------------------------
// Created by https://peakd.com/@gadrian with the support of AI.
//--------------------------------------------------------------

class HivePortfolioCharter {
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

        this.showStatus('Loading files...', 'info');

        try {
            const filePromises = files.map(file => this.readJSONFile(file));
            const results = await Promise.all(filePromises);

            const validSnapshots = results.filter(result => result !== null);
            
            if (validSnapshots.length === 0) {
                this.showStatus('No valid JSON files found', 'error');
                return;
            }

            // Validate account and snapshot type consistency
            const validationResult = this.validateSnapshotConsistency(validSnapshots);
            if (!validationResult.isValid) {
                this.showStatus(validationResult.message, 'error');
                return;
            }

            this.rawData = validSnapshots
                .sort((a, b) => new Date(a.metadata.snapshot_timestamp) - new Date(b.metadata.snapshot_timestamp));

            this.extractAvailableItems();
            this.updateSpecificItemDropdown();
            this.setDateRange();
            this.updateCharts();

            const accounts = [...new Set(this.rawData.map(s => s.metadata.account))];
            //const account = this.rawData[0].metadata.account;
            const snapshotTypes = [...new Set(this.rawData.map(s => s.metadata.snapshot_type))];
            this.showStatus(`Successfully loaded ${this.rawData.length} snapshots for account(s): ${accounts.join(', ')} (Types: ${snapshotTypes.join(', ')})`, 'success');
        } catch (error) {
            this.showStatus(`Error loading files: ${error.message}`, 'error');
        }
    }

    readJSONFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    // Validate that required metadata exists
                    if (!data.metadata || !data.metadata.account || !data.metadata.snapshot_type) {
                        console.warn(`File ${file.name} missing required metadata (account or snapshot_type)`);
                        resolve(null);
                        return;
                    }
                    resolve(data);
                } catch (error) {
                    console.error(`Error parsing ${file.name}:`, error);
                    resolve(null);
                }
            };
            reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
            reader.readAsText(file);
        });
    }

    /**
     * Validate that all snapshots come from the same account and have consistent data
     */
    validateSnapshotConsistency(snapshots) {
        if (snapshots.length === 0) {
            return { isValid: false, message: 'No valid snapshots found' };
        }

        const accounts = [...new Set(snapshots.map(s => s.metadata.account))];
        if (accounts.length > 1) {
            console.log(`Multiple accounts loaded: ${accounts.join(', ')}. Charts and dashboard will show combined totals.`);
        }

        // Check snapshot type consistency - allow multiple types but warn if mixed
        const snapshotTypes = [...new Set(snapshots.map(s => s.metadata.snapshot_type))];
        if (snapshotTypes.length > 1) {
            console.warn(`Multiple snapshot types found: ${snapshotTypes.join(', ')}. You can filter by type using the dropdown.`);
        }

        // Additional validation: check for required data structure
        const invalidSnapshots = snapshots.filter(s => !s.metadata.snapshot_timestamp);
        if (invalidSnapshots.length > 0) {
            return { 
                isValid: false, 
                message: `${invalidSnapshots.length} snapshots missing timestamp data` 
            };
        }

        return { isValid: true };
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

    extractDataForCategory(snapshots, category, specificItem) {
        // If snapshots is a single snapshot (backward compatibility), convert to array
        if (!Array.isArray(snapshots)) {
            snapshots = [snapshots];
        }
        
        // Sum values across all accounts for the same timestamp
        const totals = { usd: 0, hive: 0, btc: 0 };
        
        snapshots.forEach(snapshot => {
            const values = this.extractSingleSnapshotData(snapshot, category, specificItem);
            totals.usd += values.usd || 0;
            totals.hive += values.hive || 0;
            totals.btc += values.btc || 0;
        });
        
        return totals;
    }

    extractSingleSnapshotData(snapshot, category, specificItem) {
        if (!snapshot) {
            return { usd: 0, hive: 0, btc: 0 };
        }
        switch (category) {
            case 'total_portfolio':
                return snapshot.summary?.total_portfolio || { usd: 0, hive: 0, btc: 0 };
            case 'layer1_total':
                return snapshot.summary?.layer1_total || { usd: 0, hive: 0, btc: 0 };
            case 'pools_total':
                return snapshot.summary?.pools_total || { usd: 0, hive: 0, btc: 0 };
            case 'tokens_total':
                return snapshot.summary?.tokens_total || { usd: 0, hive: 0, btc: 0 };
            case 'specific_token':
                if (!specificItem) return { usd: 0, hive: 0, btc: 0 };
                if (specificItem.startsWith('L1:')) {
                    const key = specificItem.replace('L1:', '');
                    const data = snapshot.layer1_holdings?.[key];
                    return data ? {
                        usd: data.value_usd || 0,
                        hive: data.value_hive || 0,
                        btc: data.value_btc || 0
                    } : { usd: 0, hive: 0, btc: 0 };
                }
                if (specificItem.startsWith('TOKEN:')) {
                    const key = specificItem.replace('TOKEN:', '');
                    const data = snapshot.tokens?.[key];
                    return data?.values || { usd: 0, hive: 0, btc: 0 };
                }
                return { usd: 0, hive: 0, btc: 0 };
            case 'specific_pool':
                if (!specificItem) return { usd: 0, hive: 0, btc: 0 };
                const poolData = snapshot.diesel_pools?.[specificItem];
                return poolData?.values || { usd: 0, hive: 0, btc: 0 };
            default:
                return { usd: 0, hive: 0, btc: 0 };
        }
    }

    /**
     * Get the appropriate threshold for filtering unrealistic price drops
     * based on snapshot type and data category
     */
    getDropThreshold(snapshotType, category) {
        const isToken = category === 'specific_token';
        
        // Base thresholds for different snapshot types
        const thresholds = {
            'daily': isToken ? 0.8 : 0.9,      // 80% for tokens, 90% for portfolios
            'weekly': isToken ? 0.85 : 0.92,   // 85% for tokens, 92% for portfolios
            'monthly': isToken ? 0.9 : 0.95    // 90% for tokens, 95% for portfolios
        };

        return thresholds[snapshotType] || thresholds['daily'];
    }

    /**
     * Filter out data points with unrealistic price drops
     */
    filterUnrealisticDrops(data, snapshotType, category) {
        if (data.length <= 1) return data;

        const threshold = this.getDropThreshold(snapshotType, category);
        const filtered = [data[0]]; // Always keep the first data point
        let filteredCount = 0;

        for (let i = 1; i < data.length; i++) {
            const current = data[i];
            const previous = filtered[filtered.length - 1];

            // Check each currency for unrealistic drops
            let shouldFilter = false;
            
            ['usd', 'hive', 'btc'].forEach(currency => {
                const currentValue = current[currency];
                const previousValue = previous[currency];
                
                // Only check if both values are positive (avoid division by zero)
                if (previousValue > 0 && currentValue > 0) {
                    const dropPercent = (previousValue - currentValue) / previousValue;
                    
                    // If drop is greater than threshold, mark for filtering
                    if (dropPercent > threshold) {
                        shouldFilter = true;
                        console.log(`Filtering unrealistic drop: ${currency.toUpperCase()} from ${previousValue} to ${currentValue} (${(dropPercent * 100).toFixed(1)}% drop) on ${current.date}`);
                    }
                }
            });

            if (!shouldFilter) {
                filtered.push(current);
            } else {
                filteredCount++;
            }
        }

        if (filteredCount > 0) {
            console.log(`Filtered ${filteredCount} data points with unrealistic price drops for ${snapshotType} ${category}`);
            this.showStatus(`Filtered ${filteredCount} data points with unrealistic price drops`, 'info');
        }

        return filtered;
    }

    updateCharts() {
        if (this.rawData.length === 0) return;

        // Clear any previous filtering status messages
        console.clear();

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
            const values = this.extractDataForCategory(snapshots, category, specificItem);
            
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
        chartData = this.filterUnrealisticDrops(chartData, snapshotType, category);

        // Update each chart
        Object.keys(this.charts).forEach(chartId => {
            const currency = this.charts[chartId].currency.toLowerCase();
            this.updateChart(chartId, chartData, currency);
        });

        // Update dashboard
        this.updateDashboard(chartData, snapshotType, category, specificItem);
    }

    updateChart(chartId, data, currency) {
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

        // Create scales with proper domain handling
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


        // Improve Y-scale calculation
        const values = chartData.map(d => d.value);
        const minValue = Math.min(...values);
        const maxValue = Math.max(...values);
        
        let yScale;
        if (minValue === maxValue) {
            // For flat line, create a scale that shows the value in the middle
            const centerValue = minValue;
            const range = Math.max(Math.abs(centerValue) * 0.1, 1); // 10% of value or minimum 1
            yScale = d3.scaleLinear()
                .domain([centerValue - range, centerValue + range])
                .range([height, 0]);
        } else {
            // For normal data, add padding and ensure 0 is included if appropriate
            const range = maxValue - minValue;
            const padding = range * 0.1; // 10% padding
            
            let domainMin = minValue - padding;
            let domainMax = maxValue + padding;
            
            // If all values are positive and close to 0, include 0 in domain
            if (minValue >= 0 && minValue < maxValue * 0.1) {
                domainMin = 0;
            }
            
            yScale = d3.scaleLinear()
                .domain([domainMin, domainMax])
                .range([height, 0]);
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

        // Add points
        g.selectAll(".dot")
        .data(chartData)
        .enter().append("circle")
        .attr("class", "dot")
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yScale(d.value))
        .attr("r", 4)
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
                const priceInfo = self.getPriceInfo(d, currency);
                if (priceInfo) {
                    tooltipContent += `<br/><em>${priceInfo}</em>`;
                }
            }
            
            // Add quantity information for specific tokens and pools
            const category = document.getElementById('dataCategory').value;
            const specificItem = document.getElementById('specificItem').value;
            
            if (category === 'specific_token' && specificItem) {
                const quantityInfo = self.getTokenQuantity(d, specificItem);
                if (quantityInfo) {
                    tooltipContent += `<br/><span style="color: #90EE90;">${quantityInfo}</span>`;
                }
                
                // Add token price information
                const tokenPriceInfo = self.getTokenPriceInfo(d, specificItem, currency);
                if (tokenPriceInfo) {
                    tooltipContent += `<br/><span style="color: #FFD700;">${tokenPriceInfo}</span>`;
                }
            } else if (category === 'specific_pool' && specificItem) {
                const sharesInfo = self.getPoolShares(d, specificItem);
                if (sharesInfo) {
                    tooltipContent += `<br/><span style="color: #87CEEB;">${sharesInfo}</span>`;
                }
                
                // Add diesel pool component information
                const poolInfo = self.getDieselPoolInfo(d, specificItem);
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

    showStatus(message, type) {
        const statusDiv = document.getElementById('status');
        statusDiv.textContent = message;
        statusDiv.className = `status ${type}`;
        statusDiv.style.display = 'block';

        if (type === 'success') {
            setTimeout(() => {
                statusDiv.style.display = 'none';
            }, 3000);
        }
    }

    /**
     * Get price information for HIVE or BTC from metadata
     */
    getPriceInfo(dataPoint, currency) {
        if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
            return null;
        }

        // Get the first snapshot to extract price data from metadata
        const snapshot = dataPoint.snapshots[0];
        const prices = snapshot.metadata?.prices;
        
        if (!prices) return null;
        
        if (currency === 'hive') {
            const hivePrice = prices.hive_usd;
            if (hivePrice && hivePrice > 0) {
                return `HIVE Price: $${d3.format(",.4f")(hivePrice)}`;
            }
        } else if (currency === 'btc') {
            const btcPrice = prices.btc_usd;
            if (btcPrice && btcPrice > 0) {
                return `BTC Price: $${d3.format(",.0f")(btcPrice)}`;
            }
        }
        
        return null;
    }

    /**
     * Get token price information for specific tokens
     */
    getTokenPriceInfo(dataPoint, specificItem, currency) {
        if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
            return null;
        }

        const tokenName = specificItem.replace('L1:', '').replace('TOKEN:', '');
        
        // Don't show HIVE price twice for L1 HIVE when on HIVE chart
        if (specificItem === 'L1:HIVE' && currency === 'hive') {
            return null;
        }

        // Calculate token price by dividing chart value by token quantity
        let totalQuantity = 0;
        let totalValue = 0;
        
        dataPoint.snapshots.forEach(snapshot => {
            if (specificItem.startsWith('L1:')) {
                const key = specificItem.replace('L1:', '');
                const data = snapshot.layer1_holdings?.[key];
                if (data && data.total_amount !== undefined && data.total_amount !== null) {
                    const quantity = typeof data.total_amount === 'string' ? parseFloat(data.total_amount) : data.total_amount;
                    if (!isNaN(quantity)) {
                        totalQuantity += quantity;
                        totalValue += data.value_usd || 0;
                    }
                }
            } else if (specificItem.startsWith('TOKEN:')) {
                const key = specificItem.replace('TOKEN:', '');
                const data = snapshot.tokens?.[key];
                if (data && data.total_amount !== undefined && data.total_amount !== null) {
                    const quantity = typeof data.total_amount === 'string' ? parseFloat(data.total_amount) : data.total_amount;
                    if (!isNaN(quantity)) {
                        totalQuantity += quantity;
                        totalValue += data.values?.usd || 0;
                    }
                }
            }
        });

        if (totalQuantity > 0 && totalValue > 0) {
            const tokenPrice = totalValue / totalQuantity;
            return `${tokenName} Price: $${d3.format(",.6f")(tokenPrice)}`;
        }
        
        return null;
    }

    /**
     * Get diesel pool component information
     */
    getDieselPoolInfo(dataPoint, specificItem) {
        if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
            return null;
        }

        const snapshot = dataPoint.snapshots[0];
        const poolData = snapshot.diesel_pools?.[specificItem];
        
        if (!poolData || !poolData.token_balances) {
            return null;
        }

        let poolInfo = [];
        
        // Get component tokens information
        Object.entries(poolData.token_balances).forEach(([token, balance]) => {
            if (balance && balance > 0) {
                const formattedBalance = d3.format(",.3f")(balance);
                poolInfo.push(`${token.toUpperCase()}: ${formattedBalance}`);
            }
        });

        // Get pool share percentage if available
        if (poolData.share_percentage) {
            const sharePercent = (poolData.share_percentage * 100).toFixed(4);
            poolInfo.push(`Share: ${sharePercent}%`);
        }

        return poolInfo.length > 0 ? poolInfo.join('<br/>') : null;
    }

    /**
     * Get token quantity information
     */
    getTokenQuantity(dataPoint, specificItem) {
        if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
            console.log('No snapshots found for token quantity');
            return null;
        }

        // Sum quantities across all snapshots for this date
        let totalQuantity = 0;
        let found = false;
        
        dataPoint.snapshots.forEach(snapshot => {
            if (specificItem.startsWith('L1:')) {
                const key = specificItem.replace('L1:', '');
                const data = snapshot.layer1_holdings?.[key];
                if (data && data.total_amount !== undefined && data.total_amount !== null) {
                    // Convert to number if it's a string
                    const quantity = typeof data.total_amount === 'string' ? parseFloat(data.total_amount) : data.total_amount;
                    if (!isNaN(quantity)) {
                        totalQuantity += quantity;
                        found = true;
                    }
                }
            } else if (specificItem.startsWith('TOKEN:')) {
                const key = specificItem.replace('TOKEN:', '');
                const data = snapshot.tokens?.[key];
                if (data && data.total_amount !== undefined && data.total_amount !== null) {
                    // Convert to number if it's a string
                    const quantity = typeof data.total_amount === 'string' ? parseFloat(data.total_amount) : data.total_amount;
                    if (!isNaN(quantity)) {
                        totalQuantity += quantity;
                        found = true;
                    }
                }
            }
        });

        // Show quantity even if it's 0
        if (found) {
            const tokenName = specificItem.replace('L1:', '').replace('TOKEN:', '');
            return `Quantity: ${d3.format(",.3f")(totalQuantity)} ${tokenName}`;
        }
        
        console.log(`No quantity found for ${specificItem}`);
        return null;
    }

    /**
     * Get pool shares information
     */
    getPoolShares(dataPoint, specificItem) {
        if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
            console.log('No snapshots found for pool shares');
            return null;
        }

        // Sum shares across all snapshots for this date
        let totalShares = 0;
        let found = false;
        
        dataPoint.snapshots.forEach(snapshot => {
            const poolData = snapshot.diesel_pools?.[specificItem];
            if (poolData && typeof poolData.shares === 'number') {
                totalShares += poolData.shares;
                found = true;
            }
        });

        if (found && totalShares > 0) {
            return `Shares: ${d3.format(",.6f")(totalShares)}`;
        }
        
        console.log(`No shares found for ${specificItem}`);
        return null;
    }

    /**
     * Update the dashboard with current portfolio values and performance metrics
     */
    updateDashboard(chartData, snapshotType, category, specificItem) {
        if (chartData.length === 0) {
            this.clearDashboard();
            return;
        }

        // Get the latest data
        const latestData = chartData[chartData.length - 1];

        // Update account info
        this.updateAccountInfo(chartData);

        // Update portfolio values using the combined snapshots
        this.updatePortfolioValues(latestData.snapshots, category, specificItem);

        // Update performance metrics for each card
        this.updateAllPerformanceMetrics(chartData, snapshotType, category, specificItem);

        // Show/hide specific item display
        this.toggleSpecificItemDisplay(category, specificItem, latestData);
    }
    /**
     * Update performance metrics for all cards
     */
    updateAllPerformanceMetrics(chartData, snapshotType, category, specificItem) {
        // Update performance for total portfolio
        this.updateCardPerformance(chartData, snapshotType, 'total_portfolio', null, 'totalMetricRow');
        
        // Update performance for layer1 holdings
        this.updateCardPerformance(chartData, snapshotType, 'layer1_total', null, 'layer1MetricRow');
        
        // Update performance for diesel pools
        this.updateCardPerformance(chartData, snapshotType, 'pools_total', null, 'poolsMetricRow');
        
        // Update performance for regular tokens
        this.updateCardPerformance(chartData, snapshotType, 'tokens_total', null, 'tokensMetricRow');
        
        // Update performance for specific item if selected
        if ((category === 'specific_token' || category === 'specific_pool') && specificItem) {
            this.updateCardPerformance(chartData, snapshotType, category, specificItem, 'specificMetricRow');
        }
    }
    /**
     * Update performance metrics for a specific card
     */
    updateCardPerformance(chartData, snapshotType, dataCategory, specificItem, metricRowId) {
        if (chartData.length < 2) {
            document.getElementById(metricRowId).innerHTML = '<span class="metric-item">Insufficient data for performance calculation</span>';
            return;
        }

        // Create chart data for this specific category
        const categoryData = chartData.map(d => {
            const values = this.extractDataForCategory(d.snapshots, dataCategory, specificItem);
            return {
                date: d.date,
                usd: values.usd || 0,
                hive: values.hive || 0,
                btc: values.btc || 0,
                snapshots: d.snapshots
            };
        });

        // Get appropriate periods based on snapshot type and data length
        const periods = this.getPeriodsForSnapshotType(snapshotType, categoryData.length);
        
        // Generate performance metrics HTML
        let metricsHtml = '';
        periods.forEach(period => {
            const performance = this.calculatePerformanceForCategory(categoryData, period.value, period.type);
            metricsHtml += `<div class="metric-item">
                <span class="metric-label">${period.label}</span>
                ${this.formatPerformance(performance)}
            </div>`;
        });

        document.getElementById(metricRowId).innerHTML = metricsHtml;
    }
    /*
     * Get appropriate periods based on snapshot type and data length
     */
    getPeriodsForSnapshotType(snapshotType, dataLength) {
        const allPeriods = {
            'daily': [
                { label: '1D', value: 1, type: 'days' },
                { label: '7D', value: 7, type: 'days' },
                { label: '14D', value: 14, type: 'days' },
                { label: '30D', value: 30, type: 'days' },
                { label: '60D', value: 60, type: 'days' },
                { label: '90D', value: 90, type: 'days' },
                { label: 'All', value: null, type: 'all' }
            ],
            'weekly': [
                { label: '1W', value: 1, type: 'weeks' },
                { label: '2W', value: 2, type: 'weeks' },
                { label: '4W', value: 4, type: 'weeks' },
                { label: '13W', value: 13, type: 'weeks' },
                { label: '26W', value: 26, type: 'weeks' },
                { label: '52W', value: 52, type: 'weeks' },
                { label: 'All', value: null, type: 'all' }
            ],
            'monthly': [
                { label: '1M', value: 1, type: 'months' },
                { label: '3M', value: 3, type: 'months' },
                { label: '6M', value: 6, type: 'months' },
                { label: '12M', value: 12, type: 'months' },
                { label: '24M', value: 24, type: 'months' },
                { label: '36M', value: 36, type: 'months' },
                { label: 'All', value: null, type: 'all' }
            ],
            'quarterly': [
                { label: '1Q', value: 1, type: 'quarters' },
                { label: '2Q', value: 2, type: 'quarters' },
                { label: '4Q', value: 4, type: 'quarters' },
                { label: '8Q', value: 8, type: 'quarters' },
                { label: '12Q', value: 12, type: 'quarters' },
                { label: '16Q', value: 16, type: 'quarters' },
                { label: 'All', value: null, type: 'all' }
            ],
            'yearly': [
                { label: '1Y', value: 1, type: 'years' },
                { label: '2Y', value: 2, type: 'years' },
                { label: '3Y', value: 3, type: 'years' },
                { label: '5Y', value: 5, type: 'years' },
                { label: '10Y', value: 10, type: 'years' },
                { label: 'All', value: null, type: 'all' }
            ]
        };

        const periods = allPeriods[snapshotType] || allPeriods['daily'];
        
        // Filter periods based on available data length
        return periods.filter(period => {
            if (period.value === null) return true; // Always show "All" period
            
            let requiredDataPoints;
            switch (period.type) {
                case 'days': requiredDataPoints = period.value; break;
                case 'weeks': requiredDataPoints = period.value; break;
                case 'months': requiredDataPoints = period.value; break;
                case 'quarters': requiredDataPoints = period.value; break;
                case 'years': requiredDataPoints = period.value; break;
                default: requiredDataPoints = 1;
            }
            
            return dataLength >= requiredDataPoints + 1; // +1 because we need at least 2 points for comparison
        });
    }
    /*
     * Calculate performance for a specific category
     */
    calculatePerformanceForCategory(categoryData, periodValue, periodType) {
        if (categoryData.length < 2) return null;

        const latestData = categoryData[categoryData.length - 1];
        const latestDate = latestData.date;
        let targetDate;

        if (periodValue === null) {
            // All time - use first data point
            targetDate = categoryData[0].date;
        } else {
            // Calculate target date based on period type
            targetDate = new Date(latestDate);
            
            switch (periodType) {
                case 'days':
                    targetDate.setDate(targetDate.getDate() - periodValue);
                    break;
                case 'weeks':
                    targetDate.setDate(targetDate.getDate() - (periodValue * 7));
                    break;
                case 'months':
                    targetDate.setMonth(targetDate.getMonth() - periodValue);
                    break;
                case 'quarters':
                    targetDate.setMonth(targetDate.getMonth() - (periodValue * 3));
                    break;
                case 'years':
                    targetDate.setFullYear(targetDate.getFullYear() - periodValue);
                    break;
            }
        }

        // Find the closest data point to the target date
        const historicalData = this.findClosestDataPoint(categoryData, targetDate);
        if (!historicalData) return null;

        // Calculate performance for USD values
        const currentValue = latestData.usd;
        const historicalValue = historicalData.usd;

        if (historicalValue === 0) return null;

        const performance = ((currentValue - historicalValue) / historicalValue) * 100;
        return performance;
    }

    /**
     * Update account information in the dashboard
     */
    updateAccountInfo(chartData) {
        const accountName = document.getElementById('accountName');
        const lastUpdate = document.getElementById('lastUpdate');

        if (chartData && chartData.length > 0) {
            const latestData = chartData[chartData.length - 1];
            const accounts = [...new Set(latestData.snapshots.map(s => s.metadata.account))];
            
            if (accounts.length === 1) {
                accountName.textContent = `${accounts[0]}`;
            } else {
                accountName.textContent = `${accounts.length} accounts: ${accounts.map(a => `${a}`).join(', ')}`;
            }
            accountName.className = 'account-name active';
            
            const updateDate = new Date(latestData.snapshots[0].metadata.snapshot_timestamp);
            const options = {
                  year: 'numeric',    // %Y
                  month: 'short',     // %b
                  day: '2-digit',     // %d
                  hour: '2-digit',    // %H
                  minute: '2-digit',  // %m
                  hour12: false       // 24h format
                };
            const formatter = new Intl.DateTimeFormat('en-RO', options);
            const formattedDate = formatter.format(updateDate);
            lastUpdate.textContent = `Last updated: ${formattedDate}`;
        } else {
            accountName.textContent = 'No account loaded';
            accountName.className = 'account-name';
            lastUpdate.textContent = 'Last updated: --';
        }
    }

    /**
     * Update portfolio values in the dashboard
     */
    updatePortfolioValues(snapshots, category, specificItem) {
        if (!snapshots || snapshots.length === 0) {
            this.clearPortfolioValues();
            return;
        }

        // Sum values across all accounts
        const totals = {
            total_portfolio: { usd: 0, hive: 0, btc: 0 },
            layer1_total: { usd: 0, hive: 0, btc: 0 },
            pools_total: { usd: 0, hive: 0, btc: 0 },
            tokens_total: { usd: 0, hive: 0, btc: 0 }
        };

        snapshots.forEach(snapshot => {
            if (snapshot.summary) {
                Object.keys(totals).forEach(key => {
                    const values = snapshot.summary[key] || {};
                    totals[key].usd += values.usd || 0;
                    totals[key].hive += values.hive || 0;
                    totals[key].btc += values.btc || 0;
                });
            }
        });

        // Update display
        this.updateCurrencyValues('total', totals.total_portfolio);
        this.updateCurrencyValues('layer1', totals.layer1_total);
        this.updateCurrencyValues('pools', totals.pools_total);
        this.updateCurrencyValues('tokens', totals.tokens_total);

        // Update specific item if selected
        if ((category === 'specific_token' || category === 'specific_pool') && specificItem) {
            const specificValues = this.extractDataForCategory(snapshots, category, specificItem);
            this.updateCurrencyValues('specific', specificValues);
        }
    }

    /**
     * Update currency values for a specific section
     */
    updateCurrencyValues(prefix, values) {
        const usdElement = document.getElementById(`${prefix}Usd`);
        const hiveElement = document.getElementById(`${prefix}Hive`);
        const btcElement = document.getElementById(`${prefix}Btc`);

        if (usdElement) usdElement.textContent = this.formatCurrency(values.usd || 0, 'usd');
        if (hiveElement) hiveElement.textContent = this.formatCurrency(values.hive || 0, 'hive');
        if (btcElement) btcElement.textContent = this.formatCurrency(values.btc || 0, 'btc');
    }

    /**
     * Format currency values for display
     */
    formatCurrency(value, type) {
        switch (type) {
            case 'usd':
                return '$' + d3.format(",.2f")(value);
            case 'hive':
                return d3.format(",.3f")(value);
            case 'btc':
                return d3.format(",.8f")(value);
            default:
                return d3.format(",.2f")(value);
        }
    }

    /**
     * Toggle specific item display based on category selection
     */
    toggleSpecificItemDisplay(category, specificItem, latestData) {
        const specificDisplay = document.getElementById('specificItemDisplay');
        const specificTitle = document.getElementById('specificItemTitle');

        if ((category === 'specific_token' || category === 'specific_pool') && specificItem) {
            specificDisplay.style.display = 'block';
            
            // Update title
            const itemName = specificItem.replace('L1:', '').replace('TOKEN:', '');
            const emoji = category === 'specific_token' ? '🪙' : '🔄';
            specificTitle.textContent = `${emoji} ${itemName}`;

            // Update values
            const values = this.extractDataForCategory(latestData.snapshots, category, specificItem);
            this.updateCurrencyValues('specific', values);
        } else {
            specificDisplay.style.display = 'none';
        }
    }

    /**
     * Find the closest data point to a target date
     */
    findClosestDataPoint(chartData, targetDate) {
        if (chartData.length === 0) return null;

        let closestData = chartData[0];
        let smallestDiff = Math.abs(chartData[0].date - targetDate);

        for (let i = 1; i < chartData.length; i++) {
            const diff = Math.abs(chartData[i].date - targetDate);
            if (diff < smallestDiff) {
                closestData = chartData[i];
                smallestDiff = diff;
            }
        }

        return closestData;
    }

    /**
     * Format performance percentage for display
     */
    formatPerformance(performance) {
        if (performance === null || performance === undefined) return '--';
        
        const formatted = Math.abs(performance).toFixed(2);
        const sign = performance >= 0 ? '+' : '-';
        const className = performance >= 0 ? 'positive' : 'negative';
        
        return `<span class="metric-value ${className}">${sign}${formatted}%</span>`;
    }

    /**
     * Clear dashboard values
     */
    clearDashboard() {
        // Clear account info
        document.getElementById('accountName').textContent = 'No account loaded';
        document.getElementById('lastUpdate').textContent = 'Last updated: --';

        // Clear portfolio values
        this.clearPortfolioValues();

        // Clear performance metrics
        const metricRows = ['totalMetricRow', 'layer1MetricRow', 'poolsMetricRow', 'tokensMetricRow', 'specificMetricRow'];
        metricRows.forEach(rowId => {
            const element = document.getElementById(rowId);
            if (element) {
                element.innerHTML = '';
            }
        });

        // Hide specific item display
        document.getElementById('specificItemDisplay').style.display = 'none';
    }

    /**
     * Clear portfolio values
     */
    clearPortfolioValues() {
        const prefixes = ['total', 'layer1', 'pools', 'tokens', 'specific'];
        prefixes.forEach(prefix => {
            const usdElement = document.getElementById(`${prefix}Usd`);
            const hiveElement = document.getElementById(`${prefix}Hive`);
            const btcElement = document.getElementById(`${prefix}Btc`);

            if (usdElement) usdElement.textContent = '$0.00';
            if (hiveElement) hiveElement.textContent = '0.000';
            if (btcElement) btcElement.textContent = '0.00000000';
        });

        // Clear performance metrics
        const metricRows = ['totalMetricRow', 'layer1MetricRow', 'poolsMetricRow', 'tokensMetricRow', 'specificMetricRow'];
        metricRows.forEach(rowId => {
            const element = document.getElementById(rowId);
            if (element) {
                element.innerHTML = '';
            }
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new HivePortfolioCharter();
});
