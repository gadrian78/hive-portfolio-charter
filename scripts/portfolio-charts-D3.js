
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
                .style("z-index", 9999)
                .style("padding", "10px")
                .style("background", "rgba(0, 0, 0, 0.8)")
                .style("color", "white")
                .style("border-radius", "5px")
                .style("pointer-events", "none")
                .style("font-size", "12px")
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

            this.rawData = results
                .filter(result => result !== null)
                .sort((a, b) => new Date(a.metadata.snapshot_timestamp) - new Date(b.metadata.snapshot_timestamp));

            this.extractAvailableItems();
            this.updateSpecificItemDropdown();
            this.setDateRange();
            this.updateCharts();

            this.showStatus(`Successfully loaded ${this.rawData.length} snapshots`, 'success');
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

    extractDataForCategory(snapshot, category, specificItem) {
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

    updateCharts() {
        if (this.rawData.length === 0) return;

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
            const values = this.extractDataForCategory(snapshot, category, specificItem);
            const parsedDate = new Date(snapshot?.metadata?.snapshot_timestamp);
            
            if (!isNaN(parsedDate)) {
                const dateKey = parsedDate.toDateString(); // Use date string as key to group by date
                const existingEntry = dateMap.get(dateKey);
                
                if (!existingEntry || parsedDate > existingEntry.originalDate) {
                    dateMap.set(dateKey, {
                        date: parsedDate,
                        originalDate: parsedDate,
                        usd: values.usd || 0,
                        hive: values.hive || 0,
                        btc: values.btc || 0
                    });
                }
            }
        });

        // Convert map to array and sort by date
        const chartData = Array.from(dateMap.values()).sort((a, b) => a.date - b.date);

        // Update each chart
        Object.keys(this.charts).forEach(chartId => {
            const currency = this.charts[chartId].currency.toLowerCase();
            this.updateChart(chartId, chartData, currency);
        });
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
            value: d[currency]
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

            self.tooltip.html(`${d3.timeFormat('%d %b %y')(d.date)}<br/>${valueStr}`)
                .style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY - 28) + "px");
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
}

document.addEventListener('DOMContentLoaded', () => {
    new HivePortfolioCharter();
});
