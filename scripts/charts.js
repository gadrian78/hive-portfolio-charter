/*******************************
 * Helper functions for charts *
 *******************************/

import { getHIVEPriceInfo, getBTCPriceInfo, getHBDPriceInfo,
         getTokenQuantity, getTokenPriceInfo, getDieselPoolInfo, getPoolShares } from './helper-functions.js';

// Helper function to create secondary Y scale
export function createSecondaryYScale(data, height) {
    const values = data.map(d => d.value).filter(v => v > 0);
    if (values.length === 0) return null;
    
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    
    if (minValue === maxValue) {
        const centerValue = minValue;
        const range = Math.max(Math.abs(centerValue) * 0.1, 1);
        return d3.scaleLinear()
            .domain([centerValue - range, centerValue + range])
            .range([height, 0]);
    }
    
    const range = maxValue - minValue;
    let padding = range * 0.1;
    /*if (maxValue / minValue < 1.1)
        padding = range * 2;
    else if (maxValue / minValue < 2)
        padding = range;
    else if (maxValue / minValue < 3)
        padding = range * 0.5;*/
    let domainMin = minValue - padding;
    let domainMax = maxValue + padding;
    
    if (minValue >= 0 && minValue < maxValue * 0.1) {
        domainMin = 0;
    }
    
    return d3.scaleLinear()
        .domain([domainMin, domainMax])
        .range([height, 0]);
}

// Helper function to create X scale
export function createXScale(chartData, width) {
    if (chartData.length === 1) {
        const singleDate = chartData[0].date;
        const pad = 1000 * 60 * 60 * 12; // 12 hours padding
        return d3.scaleTime()
            .domain([new Date(singleDate.getTime() - pad), new Date(singleDate.getTime() + pad)])
            .range([0, width]);
    } else {
        return d3.scaleTime()
            .domain(d3.extent(chartData, d => d.date))
            .range([0, width]);
    }
}

// Helper function to create primary Y scale
export function createYScale(chartData, height, synchronizedScales, currency) {
    if (synchronizedScales && synchronizedScales[currency]) {
        return d3.scaleLinear()
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
            return d3.scaleLinear()
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
            
            return d3.scaleLinear()
                .domain([domainMin, domainMax])
                .range([height, 0]);
        }
    }
}

// Helper function to add grid lines
export function addGridLines(g, xScale, yScale, width, height) {
    // Horizontal grid lines
    g.append("g")
        .attr("class", "grid")
        .attr("transform", `translate(0,${height})`)
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3)
        .call(d3.axisBottom(xScale)
            .tickSize(-height)
            .tickFormat("")
        );

    // Vertical grid lines
    g.append("g")
        .attr("class", "grid")
        .style("stroke-dasharray", "3,3")
        .style("opacity", 0.3)
        .call(d3.axisLeft(yScale)
            .tickSize(-width)
            .tickFormat("")
        );
}

// Helper function to add axes, including small values BTC support for superscript notation
export function addAxes(g, xScale, yScaleLeft, yScaleRight, chartData, currency, width, height) {
    const [leftMinValue, leftMaxValue] = yScaleLeft.domain();
    const leftDecimalPlaces = calculateOptimalLeftDecimalPlaces(leftMinValue, leftMaxValue, currency);
    
    const yAxisLeft = d3.axisLeft(yScaleLeft)
        .ticks(5)
        .tickFormat(d => {
            if (currency === 'usd') return '$' + d3.format(`,.${leftDecimalPlaces}f`)(d);
            if (currency === 'hive') return d3.format(`,.${leftDecimalPlaces}f`)(d) + ' HIVE';
            if (currency === 'btc') {
                const formattedValue = formatBTCWithSuperscript(d, leftDecimalPlaces);
                return formattedValue + ' BTC';
            }
            return d3.format(`,.${leftDecimalPlaces}f`)(d);
        });
    
    g.append("g")
        .attr("class", "axis axis-left")
        .call(yAxisLeft);
    
    // Apply BTC superscript formatting to left axis labels
    if (currency === 'btc') {
        g.selectAll(".axis-left .tick text")
            .each(function(d) {
                const {wholeNumber, leadingZeros, significantPart} = getBTCWithSuperscript(d, leftDecimalPlaces);
                const text = d3.select(this);
                text.text(""); // Clear default text
                
                if (leadingZeros) {
                    text.append("tspan").text(wholeNumber + '.0');
                    text.append("tspan")
                        .text(leadingZeros)
                        .style("font-size", "8px")   // bigger superscript
                        .attr("dy", "-4px")          // raise it
                        .attr("dx", "1px");
                    text.append("tspan")
                        .text(significantPart)
                        .attr("dy", "4px")           // return to baseline
                        .attr("dx", "1px");
                    text.append("tspan")
                        .text(" BTC")
                        .attr("dy", "0px");          // keep at baseline
                } else {
                    if (significantPart)
                        text.text(wholeNumber + '.' + significantPart + ' BTC');
                    else 
                        text.text(wholeNumber + ' BTC');
                }
            });
    }
    
    // Right Y-axis with improved BTC formatting
    if (yScaleRight) {
        // Get the domain (min/max) of the right Y scale
        const [minValue, maxValue] = yScaleRight.domain();
        
        // Determine optimal decimal places based on value range and type
        const decimalPlaces = calculateOptimalDecimalPlacesRightYaxis(minValue, maxValue, currency);
        
        const yAxisRight = d3.axisRight(yScaleRight)
            .ticks(5)
            .tickFormat(d => {
                const chartsType = document.getElementById('chartsType').value;
                const category = document.getElementById('dataCategory').value;
                const specificItem = document.getElementById('specificItem').value;
                
                if (specificItem) {
                    if ((chartsType === 'value_amount') && (category === 'specific_token' || category === 'specific_pool')) {
                        if (category === 'specific_token') {
                            return d3.format(`,.${decimalPlaces}f`)(d);
                        } else if (category === 'specific_pool') {
                            return d3.format(`,.${Math.min(decimalPlaces, 6)}f`)(d);
                        }
                    }
                    else if ((chartsType === 'value_price') && (category === 'specific_token')) {
                        const specificToken = specificItem.replace('TOKEN:', '').replace('L1:', '').toUpperCase();
                        if (currency === 'hive') {
                            const tokenArray = ['SWAP.BTC', 'SWAP.ETH', 'SWAP.SOL', 'SWAP.LTC', 'SWAP.BNB', 'SWAP.BCH'];
                            if (tokenArray.includes(specificToken)) {
                                return d3.format(`,.${Math.min(decimalPlaces, 2)}f`)(d);
                            } else {
                                return d3.format(`,.${decimalPlaces}f`)(d);
                            }
                        }
                        else if (currency === 'btc') {
                            const formattedValue = formatBTCWithSuperscript(d, Math.min(decimalPlaces, 8));
                            return formattedValue;
                        }
                        else if (currency === 'usd') {
                            if (specificToken === 'SWAP.BTC') {
                                return d3.format(`,.${Math.min(decimalPlaces, 2)}f`)(d);
                            } else {
                                return d3.format(`,.${decimalPlaces}f`)(d);
                            }
                        }
                    }
                }
                return d3.format(`,.${decimalPlaces}f`)(d);
            });
            
        g.append("g")
            .attr("class", "axis axis-right")
            .attr("transform", `translate(${width}, 0)`)
            .call(yAxisRight);
        
        // Apply BTC superscript formatting to right axis labels
        const chartsType = document.getElementById('chartsType').value;
        const category = document.getElementById('dataCategory').value;
        const specificItem = document.getElementById('specificItem').value;
        
        if (specificItem && chartsType === 'value_price' && category === 'specific_token' && currency === 'btc') {
            g.selectAll(".axis-right .tick text")
                .each(function(d) {
                    const {wholeNumber, leadingZeros, significantPart} = getBTCWithSuperscript(d, Math.min(decimalPlaces, 8));
                    const text = d3.select(this);
                    text.text(""); // Clear default text
                    
                    if (leadingZeros) {
                        text.append("tspan").text(wholeNumber + '.0');
                        text.append("tspan")
                            .text(leadingZeros)
                            .style("font-size", "7px")   // consistent superscript size
                            .attr("dy", "-4px")          // raise it
                            .attr("dx", "1px");
                        text.append("tspan")
                            .text(significantPart)
                            .attr("dy", "4px")           // return to baseline
                            .attr("dx", "1px");
                    } else {
                        if (significantPart)
                            text.text(wholeNumber + '.' + significantPart);
                        else 
                            text.text(wholeNumber);
                    }
                });
        }
    }
    
    // X-axis (existing logic)
    let xAxis;
    if (chartData.length <= 8) {
        xAxis = d3.axisBottom(xScale)
            .tickFormat(d3.timeFormat("%d %b %y"))
            .tickValues(chartData.map(d => d.date));
    } else {
        xAxis = d3.axisBottom(xScale)
            .ticks(5)
            .tickFormat(d3.timeFormat('%d %b %y'));
    }
    
    g.append("g")
        .attr("class", "axis")
        .attr("transform", `translate(0,${height})`)
        .call(xAxis)
        .selectAll("text")
        .style("text-anchor", "end")
        .attr("dx", "-.6em")
        .attr("dy", ".15em")
        .attr("transform", "rotate(-45)");
}

// Helper function to calculate optimal decimal places
export function calculateOptimalDecimalPlacesRightYaxis(minValue, maxValue, currency) {
    const chartsType = document.getElementById('chartsType').value;
    const category = document.getElementById('dataCategory').value;
    const specificItem = document.getElementById('specificItem').value;
    
    // Handle zero or very small ranges
    if (maxValue === minValue || maxValue - minValue < 0.000001) {
        return currency === 'btc' ? 8 : 4;
    }
    
    // For amounts
    if (chartsType === 'value_amount') {
        // Determine significant digits needed
        const range = maxValue - minValue;
        const avgValue = (maxValue + minValue) / 2;
        
        if (avgValue >= 1000) return 0;
        if (avgValue >= 100) return 1;
        if (avgValue >= 10) return 2;
        if (avgValue >= 1) return 3;
        if (avgValue >= 0.1) return 4;
        if (avgValue >= 0.01) return 5;
        return 6;
    }
    
    // For prices
    if (chartsType === 'value_price') {
        const specificToken = specificItem.replace('TOKEN:', '').replace('L1:', '').toUpperCase();
        const avgValue = (maxValue + minValue) / 2;
        
        if (currency === 'usd') {
            if (specificToken === 'SWAP.BTC' && avgValue >= 10000) return 0;
            if (avgValue >= 100) return 1;
            if (avgValue >= 1) return 2;
            if (avgValue >= 0.1) return 2;
            if (avgValue >= 0.01) return 3;
            if (avgValue >= 0.001) return 4;
            return 6;
        } else if (currency === 'btc') {
            if (avgValue >= 0.001) return 6;
            if (avgValue >= 0.0001) return 7;
            return 8;
        } else if (currency === 'hive') {
            const highValueTokens = ['SWAP.BTC', 'SWAP.ETH', 'SWAP.SOL', 'SWAP.LTC', 'SWAP.BNB', 'SWAP.BCH'];
            if (highValueTokens.includes(specificToken) && avgValue >= 100) return 0;
            if (avgValue >= 10) return 1;
            if (avgValue >= 1) return 2;
            if (avgValue >= 0.1) return 3;
            return 4;
        }
    }
    
    return 3; // Default fallback
}

// Helper function to calculate maximum label width
export function calculateMaxLabelWidth(yScale, decimalPlaces, currency) {
    const [minValue, maxValue] = yScale.domain();
    const testValues = [minValue, maxValue, (minValue + maxValue) / 2];
    
    let maxWidth = 0;
    const chartsType = document.getElementById('chartsType').value;
    const category = document.getElementById('dataCategory').value;
    
    testValues.forEach(value => {
        let formattedValue;
        if (chartsType === 'value_price' && currency === 'usd') {
            formattedValue = '$' + d3.format(`,.${decimalPlaces}f`)(value);
        } else {
            formattedValue = d3.format(`,.${decimalPlaces}f`)(value);
        }
        
        // Estimate character width (approximately 8px per character for typical fonts)
        const estimatedWidth = formattedValue.length * 6;
        maxWidth = Math.max(maxWidth, estimatedWidth);
    });
    
    return maxWidth;
}

// Helper function to calculate optimal decimal places for left Y axis (portfolio values)
export function calculateOptimalLeftDecimalPlaces(minValue, maxValue, currency) {
    // Handle zero or very small ranges
    if (maxValue === minValue || maxValue - minValue < 0.000001) {
        if (currency === 'btc') return 8;
        if (currency === 'usd') return 2;
        if (currency === 'hive') return 3;
        return 3;
    }
    
    const avgValue = (maxValue + minValue) / 2;
    const range = maxValue - minValue;
    
    // Currency-specific logic for portfolio values
    if (currency === 'usd') {
        if (avgValue >= 10000) return 0;
        if (avgValue >= 1000) return 1;
        if (avgValue >= 100) return 2;
        if (avgValue >= 10) return 2;
        if (avgValue >= 1) return 3;
        if (avgValue >= 0.1) return 3;
        return 4;
    } else if (currency === 'btc') {
        // For BTC, we need to consider superscript formatting for small values
        const absAvg = Math.abs(avgValue);
        const absMax = Math.abs(maxValue);
        const absMin = Math.abs(minValue);
        
        // Check if we need superscript notation (values < 0.001)
        if (absMax < 0.001 && absMax > 0) {
            // For superscript notation, we want fewer decimal places in the significant part
            // since the leading zeros are handled by superscript
            if (absAvg >= 0.0001) return 3; // 0^4xxx format
            if (absAvg >= 0.00001) return 2; // 0^5xx format  
            return 2; // 0^6xx format or smaller
        } else if (absAvg >= 1) {
            return 6; // Standard BTC format for larger values
        } else if (absAvg >= 0.1) {
            return 7;
        } else if (absAvg >= 0.01) {
            return 8;
        } else {
            return 8; // Will use superscript for < 0.001
        }
    } else if (currency === 'hive') {
        if (avgValue >= 1000) return 0;
        if (avgValue >= 100) return 1;
        if (avgValue >= 20) return 2;
        if (avgValue >= 5) return 2;
        if (avgValue >= 1   ) return 3;
        return 4;
    }
    
    return 3; // Default fallback
}

// Helper function to calculate maximum left label width
export function calculateMaxLeftLabelWidth(yScale, currency) {
    const [minValue, maxValue] = yScale.domain();
    const leftDecimalPlaces = calculateOptimalLeftDecimalPlaces(minValue, maxValue, currency);
    const testValues = [minValue, maxValue, (minValue + maxValue) / 2];
    
    let maxWidth = 0;
    
    testValues.forEach(value => {
        let formattedValue;
        if (currency === 'usd') {
            formattedValue = '$' + d3.format(`,.${leftDecimalPlaces}f`)(value);
        } else if (currency === 'hive') {
            formattedValue = d3.format(`,.${leftDecimalPlaces}f`)(value) + ' HIVE';
        } else if (currency === 'btc') {
            // Use the same BTC formatting logic as the right axis
            const btcFormatted = formatBTCWithSuperscript(value, leftDecimalPlaces);
            formattedValue = btcFormatted + ' BTC';
            
            // For superscript notation, estimate width more accurately
            // Superscript characters are smaller, so adjust the calculation
            if (Math.abs(value) < 0.001 && Math.abs(value) > 0) {
                // Account for the fact that superscript takes less visual space
                const superscriptReduction = 0.8; // Superscript is roughly 80% of normal char width
                const {wholeNumber, leadingZeros, significantPart} = getBTCWithSuperscript(value, leftDecimalPlaces);
                
                if (leadingZeros) {
                    // "0.0" + superscript + significant part + " BTC"
                    const normalChars = wholeNumber.length + 2 + significantPart.length + 4; // +4 for " BTC"
                    const superscriptChars = String(leadingZeros).length;
                    const estimatedWidth = (normalChars * 6) + (superscriptChars * 6 * superscriptReduction);
                    maxWidth = Math.max(maxWidth, estimatedWidth);
                    return; // Skip the normal calculation below
                }
            }
        } else {
            formattedValue = d3.format(`,.${leftDecimalPlaces}f`)(value);
        }
        
        // Estimate character width (approximately 6px per character for typical fonts)
        const estimatedWidth = formattedValue.length * 6;
        maxWidth = Math.max(maxWidth, estimatedWidth);
    });
    
    return maxWidth;
}

function toSuperscript(str) {
    const superscriptDigits = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³',
        '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷',
        '8': '⁸', '9': '⁹'
    };
    return str.split('').map(char => superscriptDigits[char] || '').join('');
}

// Helper function to format small BTC values with superscript notation
function formatBTCWithSuperscript(value, decimalPlaces) {

    const {wholeNumber, leadingZeros, significantPart} = getBTCWithSuperscript(value, decimalPlaces);

    if (leadingZeros)
        return `${wholeNumber}.0${toSuperscript(String(leadingZeros))}${significantPart}`;
    else return `${wholeNumber}.${significantPart}`;
}

// Helper function to get the components of a small a BTC value, in a superscript notation
function getBTCWithSuperscript(value, decimalPlaces = 8) {
    if (value === 0) return '0';
    
    const absValue = Math.abs(value);
    
    // Only apply superscript formatting for very small values (less than 0.001)
    if (absValue < 0.001 && absValue > 0) {
        // Find the number of leading zeros after decimal point
        const str = absValue.toFixed(12); // Use high precision
        const match = str.match(/^0\.0*([1-9])/);
        
        if (match) {
            const leadingZeros = str.indexOf(match[1]) - 2; // -2 for "0."
            if (leadingZeros >= 3) {
                // Extract significant digits more carefully
                const significantStart = str.indexOf(match[1]);
                const significantPart = str.substring(significantStart).replace(/(\d*?[1-9])0+$/g, '$1'); // removes trailing zeroes
    
                // Calculate how many decimal places we need for the significant part
                const significantDecimalPlaces = Math.min(decimalPlaces, 8);            
                
                // Parse and format to avoid floating point precision issues
                const significantValue = parseFloat(significantPart);
                const formattedSignificant = significantValue.toFixed(significantDecimalPlaces);
                
                // Remove trailing zeros and decimal point if not needed
                const cleanedSignificant = parseFloat(formattedSignificant).toString().substring(0, significantDecimalPlaces);
                
                const sign = value < 0 ? '-' : '';
                const wholeNumber = `${sign}0`;
                return {wholeNumber:wholeNumber, leadingZeros: leadingZeros, significantPart: cleanedSignificant};
            }
        }
    }
    
    // Fallback to regular formatting with proper decimal places
    const formatted = d3.format(`,.${decimalPlaces}f`)(value);
    
    // Remove excessive trailing zeros but keep at least 2 decimal places for BTC
    if (decimalPlaces > 2 && formatted.includes('.')) {
        const parts = formatted.split('.');
        let decimals = parts[1];
        
        // Remove trailing zeros but keep at least 2 decimal places
        while (decimals.length > 2 && decimals.endsWith('0')) {
            decimals = decimals.slice(0, -1);
        }
        return {wholeNumber:parts[0], leadingZeros:null, significantPart:decimals};
    } else if (formatted.includes('.')) {
        const parts = formatted.split('.');
        return {wholeNumber:parts[0], leadingZeros:null, significantPart:parts[1]};
    }
    return {wholeNumber:formatted, leadingZeros:null, significantPart:null};
}

// Updated helper function to add line and points with layering control
export function addLineAndPoints(instance, g, chartData, xScale, yScale, color, currency, lineType) {
    // Create a group for this line type to control layering
    const lineGroup = g.append("g")
        .attr("class", `line-group-${lineType}`)
        .style("pointer-events", "all");
    
    // Add line (if more than 1 point)
    if (chartData.length > 1) {
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        lineGroup.append("path")
            .datum(chartData)
            .attr("fill", "none")
            .attr("stroke", color)
            .attr("stroke-width", lineType === 'secondary' ? 1.5 : 2)
            //.attr("stroke-dasharray", lineType === 'secondary' ? "5,5" : "none")
            .attr("d", line)
            .style("opacity", lineType === 'secondary' ? 0.8 : 1)
            .style("pointer-events", "none"); // Prevent lines from blocking interactions
    }

    // Determine point radius based on data length
    let radius = 5;
    if (chartData.length > 180) radius = 1;
    else if (chartData.length > 60) radius = 2;
    else if (chartData.length > 30) radius = 3;
    else if (chartData.length > 5) radius = 4;
    
    // Make secondary points slightly smaller
    if (lineType === 'secondary') radius = Math.max(1, radius - 1);

    // Add points with larger interaction area
    lineGroup.selectAll(`.dot-${lineType}`)
        .data(chartData)
        .enter().append("circle")
        .attr("class", `dot dot-${lineType}`)
        .attr("cx", d => xScale(d.date))
        .attr("cy", d => yScale(d.value))
        .attr("r", radius)
        .style("fill", color)
        .style("stroke", "#fff")
        .style("stroke-width", lineType === 'secondary' ? 1 : 2)
        .style("opacity", lineType === 'secondary' ? 0.9 : 1)
        .style("cursor", "pointer")
        .style("pointer-events", "all")
        .on("mouseover", function(event, d) {
            // Bring hovered point to front and make it more visible
            d3.select(this).raise();
            d3.select(this).attr("r", radius + 2); // Slightly bigger on hover
            
            instance.tooltip.transition()
                .duration(200)
                .style("opacity", .9);

            // Generate tooltip content for the appropriate line type
            const tooltipContent = lineType === 'primary' 
                ? generateTooltipContent(d, currency, true)
                : generateSecondaryTooltipContent(d, currency, true);

            instance.tooltip.html(tooltipContent)
                .style("left", (event.pageX + 15) + "px")
                .style("top", (event.pageY - 10) + "px");
        })
        .on("mouseout", function() {
            // Reset size
            d3.select(this).attr("r", radius);
            
            instance.tooltip.transition()
                .duration(500)
                .style("opacity", 0);
        })
        .on("dblclick", async function(event, d) {
            try {
                // Generate clean text content for clipboard
                const clipboardContent = lineType === 'primary'
                    ? generateTooltipContent(d, currency, false)
                    : generateSecondaryTooltipContent(d, currency, false);
                
                await navigator.clipboard.writeText(clipboardContent);

                // Visual feedback
                instance.tooltip.classed("invert-tooltip", true);
                setTimeout(() => instance.tooltip.classed("invert-tooltip", false), 300);
                
                const originalRadius = d3.select(this).attr("r");
                d3.select(this)
                    .transition()
                    .duration(200)
                    .attr("r", parseFloat(originalRadius) * 1.5)
                    .style("fill", "#00ff00")
                    .transition()
                    .duration(500)
                    .attr("r", originalRadius)
                    .style("fill", color);
                    
            } catch (err) {
                console.error('Failed to copy to clipboard:', err);
                showStatus('Failed to copy to clipboard', 'error');
                setTimeout(() => clearStatus(), 2000);
            }
        });
}

// Helper function to ensure proper layering of chart elements
export function ensurePrimaryChartOnTop(g) {
    // Move all primary chart elements to the end (top layer)
    g.selectAll('.line-group-primary').raise();
}

// Helper function to generate the primary tooltip.
// If asHTML is true, then the content for the tooltip object is prepared, otherwise a content stripped of HTML is prepared to be copied to clipboard
export function generateTooltipContent(d, currency, asHTML = false) {
    let valueStr;
    if (currency === 'usd') valueStr = '$' + d3.format(",.2f")(d.value);
    else if (currency === 'hive') valueStr = d3.format(",.3f")(d.value) + ' HIVE';
    else if (currency === 'btc') valueStr = d3.format(",.8f")(d.value) + ' BTC';
    else valueStr = d3.format(",")(d.value);

    // Build tooltip content with format-specific separators and emphasis
    const separator = asHTML ? '<br/>' : '\n';
    const strongStart = asHTML ? '<strong>' : '';
    const strongEnd = asHTML ? '</strong>' : '';
    const emStart = asHTML ? '<em>' : '';
    const emEnd = asHTML ? '</em>' : '';

    let tooltipContent = `${strongStart}${d3.timeFormat('%d %b %Y')(d.date)}${strongEnd}${separator}`;
    tooltipContent += `${strongStart}${valueStr}${strongEnd}`;

    // Add price information for HIVE and BTC charts
    let priceInfo = null;
    if (currency === 'hive') {
        const hivePrice = getHIVEPriceInfo(d);
        if (hivePrice) {
            priceInfo = `HIVE Price: $${d3.format(",.4f")(hivePrice)}`;
        }
        if (priceInfo) {
            const cleanPriceInfo = asHTML ? priceInfo : priceInfo.replace(/<[^>]*>/g, '');
            tooltipContent += `${separator}${emStart}${cleanPriceInfo}${emEnd}`;
        }
    } else if (currency === 'btc') {
        const btcPrice = getBTCPriceInfo(d);
        if (btcPrice) {
            priceInfo = `BTC Price: $${d3.format(",.0f")(btcPrice)}`;
        }
        if (priceInfo) {
            const cleanPriceInfo = asHTML ? priceInfo : priceInfo.replace(/<[^>]*>/g, '');
            tooltipContent += `${separator}${emStart}${cleanPriceInfo}${emEnd}`;
        }
    }

    const category = document.getElementById('dataCategory').value;
    const specificItem = document.getElementById('specificItem').value;

    if (category === 'specific_token' && specificItem) {
        // Add HBD Price info to tooltip if specific item is SWAP.HBD or HBD on L1 or currency is usd
        if (currency == "usd" ||
            specificItem  == "TOKEN:SWAP.HBD" || specificItem == "L1:liquid_hbd" || specificItem == "L1:savings_hbd") {

            const hbdPrice = getHBDPriceInfo(d, currency);
            let hbd_priceInfo = null;
            if (hbdPrice) {
                if (currency === 'hive') {
                        hbd_priceInfo = `HBD Price: ${d3.format(",.3f")(hbdPrice)} HIVE`;
                } else if (currency === 'btc') {
                        hbd_priceInfo = `HBD Price: ${d3.format(",.8f")(hbdPrice)} BTC`;
                } else if (currency === 'usd') {
                    hbd_priceInfo = `HBD Price: $${d3.format(",.3f")(hbdPrice)}`;
                }
            }
            if (hbd_priceInfo) {
                const cleanHbdInfo = asHTML ? hbd_priceInfo : hbd_priceInfo.replace(/<[^>]*>/g, '');
                tooltipContent += `${separator}${cleanHbdInfo}`;
            }
        }
        
        // Add quantity information for specific tokens and pools
        const totalQuantity = getTokenQuantity(d, specificItem);
        let quantityInfo;
        if (totalQuantity) {
            const tokenName = specificItem.replace('L1:', '').replace('TOKEN:', '');
            quantityInfo = `Quantity: ${d3.format(",.3f")(totalQuantity)} ${tokenName}`;
        } else quantityInfo = null; 
        if (quantityInfo) {
            const cleanQuantityInfo = asHTML ? `<span style="color: #90EE90;">${quantityInfo}</span>` : quantityInfo.replace(/<[^>]*>/g, '');
            tooltipContent += `${separator}${cleanQuantityInfo}`;
        }
        
        // Add token price information
        const tokenPrice = getTokenPriceInfo(d, specificItem, currency);
        const tokenName = specificItem.replace('L1:', '').replace('TOKEN:', '');
        let tokenPriceInfo = null;
        if (tokenPrice) {
            switch (currency) {
                case 'usd':
                        tokenPriceInfo = `${tokenName} Price: $${d3.format(",.6f")(tokenPrice)}`;
                    break;
                case 'hive':
                        tokenPriceInfo = `${tokenName} Price: ${d3.format(",.6f")(tokenPrice)} HIVE`;
                    break;
                case 'btc':
                        tokenPriceInfo = `${tokenName} Price: ${d3.format(",.10f")(tokenPrice)} BTC`;
                    break;
            }
        }
        if (tokenPriceInfo) {
            const cleanTokenPrice = asHTML ? `<span style="color: #FFD700;">${tokenPriceInfo}</span>` : tokenPriceInfo.replace(/<[^>]*>/g, '');
            tooltipContent += `${separator}${cleanTokenPrice}`;
        }
    } else if (category === 'specific_pool' && specificItem) {
        const totalShares = getPoolShares(d, specificItem);
        let sharesInfo;
        if (totalShares) {
            sharesInfo = `Shares: ${d3.format(",.6f")(totalShares)}`;
        } else sharesInfo = null;
        if (sharesInfo) {
            const cleanSharesInfo = asHTML ? `<span style="color: #87CEEB;">${sharesInfo}</span>` : sharesInfo.replace(/<[^>]*>/g, '');
            tooltipContent += `${separator}${cleanSharesInfo}`;
        }
        
        // Add diesel pool component information
        const poolInfo = getDieselPoolInfo(d, specificItem);
        if (poolInfo) {
            const cleanPoolInfo = asHTML ? `<span style="color: #DDA0DD;">${poolInfo}</span>` : poolInfo.replace(/<[^>]*>/g, '');
            tooltipContent += `${separator}${cleanPoolInfo}`;
        }
    }

    return tooltipContent;
}

// Helper function to generate secondary tooltip content
export function generateSecondaryTooltipContent(d, currency, asHTML = false) {

    const chartsType = document.getElementById('chartsType').value;
    const category = document.getElementById('dataCategory').value;
    const specificItem = document.getElementById('specificItem').value;

    const separator = asHTML ? '<br/>' : '\n';
    const strongStart = asHTML ? '<strong>' : '';
    const strongEnd = asHTML ? '</strong>' : '';
    let text_color = '#FFFFFF';
    if (chartsType === 'value_price')
        text_color = '#FFD700';
    else if (chartsType === 'value_amount' && category === 'specific_pool')
            text_color = '#87CEEB';
         else text_color = '#90EE90';
    const coloredStart = asHTML ? `<span style="color: ${text_color};">` : '';
    const coloredEnd = asHTML ? '</span>' : '';
    
    let valueStr = '';
    let labelStr = '';
    
    if (chartsType === 'value_amount') {
        const itemName = specificItem.replace("L1:", "").replace("TOKEN:","").toUpperCase();
        if (category === 'specific_pool') {
            valueStr = d3.format(",.6f")(d.value);
            labelStr = `${itemName} Pool Shares`;
        } else {
            valueStr = d3.format(",.3f")(d.value);
            labelStr = `${itemName} Amount`;
        }
    } else if (chartsType === 'value_price') {
        if (currency === 'usd') valueStr = '$' + d3.format(",.6f")(d.value);
        else if (currency === 'hive') valueStr = d3.format(",.6f")(d.value) + ' HIVE';
        else if (currency === 'btc') valueStr = d3.format(",.10f")(d.value) + ' BTC';
        const tokenName = specificItem.replace("L1:", "").replace("TOKEN:","").toUpperCase();
        labelStr = asHTML ? `${tokenName} Price` : `${tokenName.replace(/<[^>]*>/g, '')} Price`;
    }
    
    let tooltipContent = `${strongStart}${d3.timeFormat('%d %b %Y')(d.date)}${strongEnd}${separator}`;
    tooltipContent += `${coloredStart}${labelStr}: ${valueStr}${coloredEnd}`;
    
    return tooltipContent;
}

// Helper function to update label for secondary chart (right Y axis), displayed below each chart title
export function updateSecondaryChartLabel(label, {token = '', diesel_pool = ''} = {}) {
    if (label === 'price') {
        token = token.replace('L1', '').replace('TOKEN:','').toUpperCase();
        if (token === '') token = ' ';
        else token = ' ' + token + ' ';
        document.getElementById('label_right_y_axis_chart_usd').innerHTML = 'with' + token + 'Price on Right Y Axis';
        document.getElementById('label_right_y_axis_chart_hive').innerHTML = 'with' + token + 'Price on Right Y Axis';
        document.getElementById('label_right_y_axis_chart_btc').innerHTML = 'with' + token + 'Price on Right Y Axis';
    } else if (label === 'amount' || label === 'total_amount') {
        token = token.replace('L1', '').replace('TOKEN:','').toUpperCase();
        if (token === '') token = ' ';
        else token = ' ' + token + ' ';
        document.getElementById('label_right_y_axis_chart_usd').innerHTML = 'with' + token + 'Total Amount on Right Y Axis';
        document.getElementById('label_right_y_axis_chart_hive').innerHTML = 'with' + token + 'Total Amount on Right Y Axis';
        document.getElementById('label_right_y_axis_chart_btc').innerHTML = 'with' + token + 'Total Amount on Right Y Axis';
    } else if (label === 'shares' || label === 'total_shares') {
        diesel_pool = diesel_pool.toUpperCase();
        if (diesel_pool === '') diesel_pool = ' ';
        else diesel_pool = ' ' + diesel_pool + ' ';
        document.getElementById('label_right_y_axis_chart_usd').innerHTML = 'with' + diesel_pool + 'Shares on Right Y Axis';
        document.getElementById('label_right_y_axis_chart_hive').innerHTML = 'with' + diesel_pool + 'Shares on Right Y Axis';
        document.getElementById('label_right_y_axis_chart_btc').innerHTML = 'with' + diesel_pool + 'Shares on Right Y Axis';
    } else {
        document.getElementById('label_right_y_axis_chart_usd').innerHTML = '&nbsp;';
        document.getElementById('label_right_y_axis_chart_hive').innerHTML = '&nbsp;';
        document.getElementById('label_right_y_axis_chart_btc').innerHTML = '&nbsp;';
    }
}
