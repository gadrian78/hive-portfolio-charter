export function showStatus(message, type) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = message;
    statusDiv.className = `status ${type}`;
    statusDiv.style.display = 'block';

    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.display = 'none';
        }, 5000);
    }
}

// Add this new method to clear status messages
export function clearStatus() {
    const statusDiv = document.getElementById('status');
    if (statusDiv) {
        statusDiv.style.display = 'none';
        statusDiv.textContent = '';
        statusDiv.className = 'status';
    }
}

//reading JSON file
export function readJSONFile(file) {
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
 * Analyze and validate all snapshots
 */
export function validateSnapshotConsistency(snapshots) {
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

// Remove duplicate snapshots
export function removeDuplicateSnapshots(snapshots) {
    const seen = new Set();
    return snapshots.filter(snapshot => {
        // Create a unique key based on timestamp and account
        const key = `${snapshot.metadata.snapshot_timestamp}_${snapshot.metadata.account}_${snapshot.metadata.snapshot_type}`;
        if (seen.has(key)) {
            return false; // Skip duplicate
        }
        seen.add(key);
        return true;
    });
}

// Reset dashboard to default state
export function resetDashboardToDefaults() {
    // Reset account info
    document.getElementById('accountName').textContent = 'No account loaded';
    document.getElementById('lastUpdate').textContent = 'Last updated: --';
    
    // Reset all currency values to zero
    const valueElements = [
        'totalUsd', 'totalHive', 'totalBtc',
        'layer1Usd', 'layer1Hive', 'layer1Btc',
        'poolsUsd', 'poolsHive', 'poolsBtc',
        'tokensUsd', 'tokensHive', 'tokensBtc',
        'specificUsd', 'specificHive', 'specificBtc'
    ];
    
    valueElements.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (id.includes('Usd')) {
                element.textContent = '$0.00';
            } else if (id.includes('Hive')) {
                element.textContent = '0.000';
            } else if (id.includes('Btc')) {
                element.textContent = '0.00000000';
            }
        }
    });
    
    // Clear all performance metrics
    const metricRows = [
        'totalMetricRow', 'layer1MetricRow', 'poolsMetricRow', 
        'tokensMetricRow', 'specificMetricRow'
    ];
    
    metricRows.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            element.innerHTML = '';
        }
    });
    
    // Hide specific item display
    const specificItemDisplay = document.getElementById('specificItemDisplay');
    if (specificItemDisplay) {
        specificItemDisplay.style.display = 'none';
    }
}

export function extractDataForCategory(snapshots, category, specificItem) {
    // If snapshots is a single snapshot (backward compatibility), convert to array
    if (!Array.isArray(snapshots)) {
        snapshots = [snapshots];
    }
    
    // Sum values across all accounts for the same timestamp
    const totals = { usd: 0, hive: 0, btc: 0 };
    
    snapshots.forEach(snapshot => {
        const values = extractSingleSnapshotData(snapshot, category, specificItem);
        totals.usd += values.usd || 0;
        totals.hive += values.hive || 0;
        totals.btc += values.btc || 0;
    });
    
    return totals;
}

function extractSingleSnapshotData(snapshot, category, specificItem) {
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
function getDropThreshold(snapshotType, category) {
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
export function filterUnrealisticDrops(data, snapshotType, category) {
    if (data.length <= 1) return data;

    const threshold = getDropThreshold(snapshotType, category);
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
        showStatus(`Filtered ${filteredCount} data points with unrealistic price drops`, 'info');
    }

    return filtered;
}

/**
 * Get price information for HIVE from metadata
 */
export function getHIVEPriceInfo(dataPoint, currency = 'usd') {
    if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
        return null;
    }

    if (currency === 'hive') return 1.0;

    // Get the first snapshot to extract price data from metadata
    const snapshot = dataPoint.snapshots[0];
    const prices = snapshot.metadata?.prices;
    
    if (!prices) return null;
    
    const hivePrice = prices.hive_usd;
    if (hivePrice && hivePrice > 0) {
        if (currency === 'btc') {
            const btcPrice = prices.btc_usd;
            if (btcPrice && btcPrice > 0) return hivePrice / btcPrice;
        }
        else return hivePrice; // if currency === 'usd'
    }
    
    return null;
}

/**
 * Get price information for BTC from metadata
 */
export function getBTCPriceInfo(dataPoint, currency = 'usd') {
    if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
        return null;
    }

    if (currency === 'btc') return 1.0;

    // Get the first snapshot to extract price data from metadata
    const snapshot = dataPoint.snapshots[0];
    const prices = snapshot.metadata?.prices;
    
    if (!prices) return null;

    const btcPrice = prices.btc_usd;
    if (btcPrice && btcPrice > 0) {
        if (currency === 'hive') {
            const hivePrice = prices.hive_usd;
            if (hivePrice && hivePrice > 0) return btcPrice / hivePrice;
        }
        else return btcPrice; // if currency === 'usd'
    }
    
    return null;
}

/**
 * Get price information for HBD from metadata
 */
export function getHBDPriceInfo(dataPoint, currency) {
    if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
        return null;
    }

    // Get the first snapshot to extract price data from metadata
    const snapshot = dataPoint.snapshots[0];
    const prices = snapshot.metadata?.prices;
    
    if (!prices) return null;
    

    const hbdPrice = prices.hbd_usd;
    if (hbdPrice && hbdPrice > 0) {
        if (currency === 'hive') {
            const hivePrice = prices.hive_usd;
            if (hivePrice && hivePrice > 0) {
                const hbdPrice_in_hive = hbdPrice / hivePrice;
                return hbdPrice_in_hive;
            }
        } else if (currency === 'btc') {
            const btcPrice = prices.btc_usd;
            if (btcPrice && btcPrice > 0) {
                const hbdPrice_in_btc = hbdPrice / btcPrice;
                return hbdPrice_in_btc;
            }
        }
        else if (currency === 'usd') {
            return hbdPrice;
        }
    }
    
    return null;
}

/**
 * Get token price information for specific tokens
 */
export function getTokenPriceInfo(dataPoint, specificItem, currency) {
    if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) {
        return null;
    }
    
    // Don't show HIVE price twice for L1 HIVE when on HIVE chart
    if (specificItem === 'L1:HIVE' && currency === 'hive') {
        return null;
    }

    // Calculate token price by dividing total value by total quantity across all snapshots
    let totalQuantity = 0;
    let totalValueUsd = 0;
    let totalValueHive = 0;
    let totalValueBtc = 0;
    let validSnapshots = 0;
    
    dataPoint.snapshots.forEach(snapshot => {
        let data = null;
        let quantity = 0;
        
        if (specificItem.startsWith('L1:')) {
            const key = specificItem.replace('L1:', '');
            data = snapshot.layer1_holdings?.[key];
            if (data && data.total_amount !== undefined && data.total_amount !== null) {
                quantity = typeof data.total_amount === 'string' ? parseFloat(data.total_amount) : data.total_amount;
                if (!isNaN(quantity) && quantity > 0) {
                    totalQuantity += quantity;
                    totalValueUsd += data.value_usd || 0;
                    totalValueHive += data.value_hive || 0;
                    totalValueBtc += data.value_btc || 0;
                    validSnapshots++;
                }
            }
        } else if (specificItem.startsWith('TOKEN:')) {
            const key = specificItem.replace('TOKEN:', '');
            data = snapshot.tokens?.[key];
            if (data && data.total_amount !== undefined && data.total_amount !== null) {
                quantity = typeof data.total_amount === 'string' ? parseFloat(data.total_amount) : data.total_amount;
                if (!isNaN(quantity) && quantity > 0) {
                    totalQuantity += quantity;
                    totalValueUsd += data.values?.usd || 0;
                    totalValueHive += data.values?.hive || 0;
                    totalValueBtc += data.values?.btc || 0;
                    validSnapshots++;
                }
            }
        }
    });

    // Only calculate price if we have valid data
    if (validSnapshots > 0 && totalQuantity > 0) {

        let tokenPrice = 0;        
        // Calculate price based on the currency being displayed
        switch (currency) {
            case 'usd':
                if (totalValueUsd > 0) {
                    tokenPrice = totalValueUsd / totalQuantity;
                    return tokenPrice;
                }
                break;
            case 'hive':
                if (totalValueHive > 0) {
                    tokenPrice = totalValueHive / totalQuantity;
                    return tokenPrice;
                }
                break;
            case 'btc':
                if (totalValueBtc > 0) {
                    tokenPrice = totalValueBtc / totalQuantity;
                    return tokenPrice;
                }
                break;
        }
    }
    
    return null;
}

/**
 * Get diesel pool component information
 */
export function getDieselPoolInfo(dataPoint, specificItem) {
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
export function getTokenQuantity(dataPoint, specificItem) {
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
            if (data && data.amount !== undefined && data.amount !== null) {
                // Convert to number if it's a string
                // note that field for "total_amount" is called "amount" for L1 tokens.
                const quantity = typeof data.amount === 'string' ? parseFloat(data.amount) : data.amount;
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
        return totalQuantity;
    }
    
    console.log(`No quantity found for ${specificItem}`);
    return null;
}

/**
 * Get pool shares information
 */
export function getPoolShares(dataPoint, specificItem) {
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
        return totalShares;
    }
    
    console.log(`No shares found for ${specificItem}`);
    return null;
}

// Get amount/total_amount for specificItem token/diesel pool (all snapshots)
export function getAmountData(dataPoint, specificItem, category) {
    if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) return null;

    if (category === 'specific_token') {
        return getTokenQuantity(dataPoint, specificItem);
    } else if (category === 'specific_pool') {
        return getPoolShares(dataPoint, specificItem);
    }    
    return null;
}

// Get price for specificToken token
export function getPriceData(dataPoint, specificItem, currency) {
    if (!dataPoint.snapshots || dataPoint.snapshots.length === 0) return 0;
    
    if (specificItem === 'TOKEN:SWAP.HIVE' || specificItem === 'L1:liquid_hive' || specificItem === 'L1:savings_hive' || specificItem === 'L1:hive_power') {
        return getHIVEPriceInfo(dataPoint, currency);
    }
    else if (specificItem === 'TOKEN:SWAP.HBD' || specificItem === 'L1:liquid_hbd' || specificItem === 'L1:savings_hbd') {
        return getHBDPriceInfo(dataPoint, currency);
    }
    else if (specificItem === 'TOKEN:SWAP.BTC') {
        return getBTCPriceInfo(dataPoint, currency);
    }
    else return getTokenPriceInfo(dataPoint, specificItem, currency);
    
    return null;
}
