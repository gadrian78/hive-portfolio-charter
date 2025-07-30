//--------------------------------------------------------------
// Created by https://peakd.com/@gadrian with the support of AI.
//--------------------------------------------------------------

import { HivePortfolioCharter } from './main.js';
import { extractDataForCategory } from './helper-functions.js';

export class PortfolioDashboard extends HivePortfolioCharter {
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
            const values = extractDataForCategory(d.snapshots, dataCategory, specificItem);
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
            const specificValues = extractDataForCategory(snapshots, category, specificItem);
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
    new PortfolioDashboard();
});
