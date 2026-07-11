// Plotter Handwriting Knockout ViewModel and Generator Logic
$(function() {
    // Helper function for random numbers
    function randomRange(min, max) {
        return Math.random() * (max - min) + min;
    }

    // Helper to parse SVG path commands to list of strokes
    function parseSVGPath(pathStr) {
        if (!pathStr) return [];
        // Insert spaces around command letters and replace commas with spaces
        const normalized = pathStr.replace(/([ML])/g, ' $1 ').replace(/,/g, ' ').trim();
        const parts = normalized.split(/\s+/);
        
        const strokes = [];
        let currentStroke = null;
        let currentCommand = 'L'; // Default is line-to
        
        let i = 0;
        while (i < parts.length) {
            const token = parts[i];
            if (token === 'M' || token === 'L') {
                currentCommand = token;
                i++;
                continue;
            }
            
            if (i + 1 < parts.length) {
                const x = parseFloat(parts[i]);
                const y = parseFloat(parts[i+1]);
                
                if (!isNaN(x) && !isNaN(y)) {
                    if (currentCommand === 'M') {
                        currentStroke = [{ x, y }];
                        strokes.push(currentStroke);
                        currentCommand = 'L'; // Subsequent points are implicit L
                    } else {
                        if (!currentStroke) {
                            currentStroke = [];
                            strokes.push(currentStroke);
                        }
                        currentStroke.push({ x, y });
                    }
                }
                i += 2;
            } else {
                i++;
            }
        }
        return strokes;
    }

    // Linearize opentype.js Path commands (including Q/C Bezier curves) into simple line-to strokes
    function convertPathToStrokes(path, skeletonMode) {
        const strokes = [];
        let currentStroke = null;
        let startX = 0;
        let startY = 0;
        let currX = 0;
        let currY = 0;

        for (let i = 0; i < path.commands.length; i++) {
            const cmd = path.commands[i];
            if (cmd.type === 'M') {
                if (currentStroke && currentStroke.length > 0) {
                    strokes.push(currentStroke);
                }
                currentStroke = [{ x: cmd.x, y: cmd.y }];
                startX = cmd.x;
                startY = cmd.y;
                currX = cmd.x;
                currY = cmd.y;
            } else if (cmd.type === 'L') {
                if (!currentStroke) {
                    currentStroke = [{ x: startX, y: startY }];
                }
                currentStroke.push({ x: cmd.x, y: cmd.y });
                currX = cmd.x;
                currY = cmd.y;
            } else if (cmd.type === 'Q') {
                if (!currentStroke) {
                    currentStroke = [{ x: currX, y: currY }];
                }
                // Interpolate quadratic Bezier curve
                const steps = 6;
                for (let step = 1; step <= steps; step++) {
                    const t = step / steps;
                    const mt = 1 - t;
                    const x = mt * mt * currX + 2 * mt * t * cmd.x1 + t * t * cmd.x;
                    const y = mt * mt * currY + 2 * mt * t * cmd.y1 + t * t * cmd.y;
                    currentStroke.push({ x, y });
                }
                currX = cmd.x;
                currY = cmd.y;
            } else if (cmd.type === 'C') {
                if (!currentStroke) {
                    currentStroke = [{ x: currX, y: currY }];
                }
                // Interpolate cubic Bezier curve
                const steps = 8;
                for (let step = 1; step <= steps; step++) {
                    const t = step / steps;
                    const mt = 1 - t;
                    const x = mt * mt * mt * currX + 3 * mt * mt * t * cmd.x1 + 3 * mt * t * t * cmd.x2 + t * t * t * cmd.x;
                    const y = mt * mt * mt * currY + 3 * mt * mt * t * cmd.y1 + 3 * mt * t * t * cmd.y2 + t * t * t * cmd.y;
                    currentStroke.push({ x, y });
                }
                currX = cmd.x;
                currY = cmd.y;
            } else if (cmd.type === 'Z') {
                if (currentStroke && currentStroke.length > 0) {
                    currentStroke.push({ x: startX, y: startY });
                }
                currX = startX;
                currY = startY;
            }
        }
        if (currentStroke && currentStroke.length > 0) {
            strokes.push(currentStroke);
        }

        // If skeleton mode is enabled, average the forward and backward paths of closed loops
        if (skeletonMode) {
            return strokes.map(function(stroke) {
                if (stroke.length >= 4) {
                    const pStart = stroke[0];
                    const pEnd = stroke[stroke.length - 1];
                    const dist = Math.hypot(pStart.x - pEnd.x, pStart.y - pEnd.y);
                    if (dist < 8.0) { // arbitrary threshold in glyph coordinates
                        return skeletonizeStroke(stroke);
                    }
                }
                return stroke;
            });
        }

        return strokes;
    }

    function skeletonizeStroke(stroke) {
        const half = Math.floor(stroke.length / 2);
        const result = [];
        for (let i = 0; i <= half; i++) {
            const p1 = stroke[i];
            const p2 = stroke[stroke.length - 1 - i];
            result.push({
                x: (p1.x + p2.x) / 2,
                y: (p1.y + p2.y) / 2
            });
        }
        return result;
    }

    // Client-side horizontal projection page lines and vertical margin line detection
    function detectPageGuidesFromImage(imgSrc, paperWidth, paperHeight, callback) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = function() {
            try {
                const canvas = document.createElement("canvas");
                const ctx = canvas.getContext("2d");
                
                canvas.width = 400;
                canvas.height = Math.round(400 * (img.height / img.width));
                
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imgData.data;
                const width = canvas.width;
                const height = canvas.height;
                
                // --- 1. Horizontal Projection for Ruled Lines ---
                const rowIntensity = new Float32Array(height);
                for (let y = 0; y < height; y++) {
                    let sum = 0;
                    for (let x = 0; x < width; x++) {
                        const idx = (y * width + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        sum += gray;
                    }
                    rowIntensity[y] = sum / width;
                }

                // High-pass filter horizontal lines
                const filteredH = new Float32Array(height);
                const windowSizeH = Math.max(10, Math.round(height * 0.08));
                for (let y = 0; y < height; y++) {
                    let neighborSum = 0;
                    let count = 0;
                    const start = Math.max(0, y - Math.floor(windowSizeH / 2));
                    const end = Math.min(height - 1, y + Math.floor(windowSizeH / 2));
                    for (let ny = start; ny <= end; ny++) {
                        neighborSum += rowIntensity[ny];
                        count++;
                    }
                    const localAvg = neighborSum / count;
                    filteredH[y] = Math.max(0, localAvg - rowIntensity[y]);
                }

                // Smooth horizontal lines profile & apply scan region constraints (22% - 94% height)
                const smoothedH = new Float32Array(height);
                const startScanY = Math.round(height * 0.22);
                const endScanY = Math.round(height * 0.94);
                for (let y = 0; y < height; y++) {
                    if (y < startScanY || y > endScanY) {
                        smoothedH[y] = 0;
                        continue;
                    }
                    let sum = 0;
                    let count = 0;
                    for (let dy = -1; dy <= 1; dy++) {
                        const ny = y + dy;
                        if (ny >= 0 && ny < height) {
                            sum += filteredH[ny];
                            count++;
                        }
                    }
                    smoothedH[y] = sum / count;
                }

                let maxValH = 0;
                for (let y = 0; y < height; y++) {
                    if (smoothedH[y] > maxValH) maxValH = smoothedH[y];
                }

                const peaksH = [];
                const thresholdH = maxValH * 0.20; // lower to 20%
                for (let y = 3; y < height - 3; y++) {
                    const val = smoothedH[y];
                    if (val > thresholdH && 
                        val > smoothedH[y - 1] && val > smoothedH[y - 2] && val > smoothedH[y - 3] &&
                        val > smoothedH[y + 1] && val > smoothedH[y + 2] && val > smoothedH[y + 3]) {
                        peaksH.push(y);
                    }
                }

                let finalLinesMm = [];
                if (peaksH.length >= 2) {
                    const diffs = [];
                    for (let i = 0; i < peaksH.length - 1; i++) {
                        diffs.push(peaksH[i + 1] - peaksH[i]);
                    }
                    diffs.sort((a, b) => a - b);
                    const medianSpc = diffs[Math.floor(diffs.length / 2)];

                    const filteredPeaks = [];
                    for (let i = 0; i < peaksH.length; i++) {
                        const py = peaksH[i];
                        if (filteredPeaks.length === 0 || (py - filteredPeaks[filteredPeaks.length - 1]) >= medianSpc * 0.7) {
                            filteredPeaks.push(py);
                        }
                    }
                    // Map to millimeters
                    finalLinesMm = filteredPeaks.map(py => (py / height) * paperHeight);
                }

                // --- 2. Vertical Projection for Margin Line ---
                // Search in columns from 10% to 35% of width
                const searchStartCol = Math.round(width * 0.10);
                const searchEndCol = Math.round(width * 0.35);
                
                const colIntensity = new Float32Array(width);
                for (let x = searchStartCol; x < searchEndCol; x++) {
                    let sum = 0;
                    for (let y = 0; y < height; y++) {
                        const idx = (y * width + x) * 4;
                        const r = data[idx];
                        const g = data[idx + 1];
                        const b = data[idx + 2];
                        const gray = 0.299 * r + 0.587 * g + 0.114 * b;
                        sum += gray;
                    }
                    colIntensity[x] = sum / height;
                }

                // High-pass filter vertical columns to find sharp vertical line
                const filteredV = new Float32Array(width);
                const windowSizeV = Math.max(8, Math.round(width * 0.05));
                for (let x = searchStartCol; x < searchEndCol; x++) {
                    let neighborSum = 0;
                    let count = 0;
                    const start = Math.max(searchStartCol, x - Math.floor(windowSizeV / 2));
                    const end = Math.min(searchEndCol - 1, x + Math.floor(windowSizeV / 2));
                    for (let nx = start; nx <= end; nx++) {
                        neighborSum += colIntensity[nx];
                        count++;
                    }
                    const localAvg = neighborSum / count;
                    filteredV[x] = Math.max(0, localAvg - colIntensity[x]);
                }

                // Find peak vertical column
                let maxValV = 0;
                let peakX = -1;
                for (let x = searchStartCol; x < searchEndCol; x++) {
                    if (filteredV[x] > maxValV) {
                        maxValV = filteredV[x];
                        peakX = x;
                    }
                }

                let detectedMarginX = null;
                if (peakX !== -1 && maxValV > 6) { 
                    detectedMarginX = (peakX / width) * paperWidth;
                }

                callback({
                    lines: finalLinesMm,
                    marginX: detectedMarginX
                });
            } catch (err) {
                console.error("Guide detection failed:", err);
                callback({ lines: [], marginX: null });
            }
        };
        img.onerror = function() {
            callback({ lines: [], marginX: null });
        };
        img.src = imgSrc;
    }

    function PlotterHandwritingViewModel(parameters) {
        var self = this;

        // Safe localStorage wrapper to prevent crashes under file:// protocol or browser security restrictions
        const safeStorage = {
            _data: {},
            getItem: function(key) {
                try {
                    return localStorage.getItem(key);
                } catch (e) {
                    return this._data[key] || null;
                }
            },
            setItem: function(key, val) {
                try {
                    localStorage.setItem(key, val);
                } catch (e) {
                    this._data[key] = String(val);
                }
            }
        };

        // Injected dependencies
        self.settingsViewModel = parameters[0];
        self.loginStateViewModel = parameters[1];

        // Observables
        self.text = ko.observable("Hello Friend,\nThis is realistic human handwriting generated directly from OctoPrint.\nNo two letters look the same!");
        self.selectedFont = ko.observable("custom");
        
        // Profiles observables
        self.savedProfiles = ko.observableArray([]);
        self.selectedProfile = ko.observable("");
        self.newProfileName = ko.observable("");

        self.skeletonMode = ko.observable(false);
        self.paperType = ko.observable("ruled");
        
        // Font & Sizing Layout (stored as numbers)
        self.fontSize = ko.observable(10);
        self.lineSpacing = ko.observable(18);
        self.baseSlantDeg = ko.observable(8); // Hint slant angle in degrees
        self.penThickness = ko.observable(0.3); // Rendering and visual line weight (mm)

        // Humanization parameters (0-100%)
        self.driftIntensity = ko.observable(25);
        self.tremorIntensity = ko.observable(15);
        self.sizeJitter = ko.observable(10);
        self.spacingJitter = ko.observable(15);
        self.slantJitter = ko.observable(15);
        self.hookIntensity = ko.observable(20);
        self.morphIntensity = ko.observable(30); // Procedural alternates (0-100%)

        // Plotter settings
        self.penUpCommand = ko.observable("G0 Z5 F5000");
        self.penDownCommand = ko.observable("G1 Z0 F2000");
        self.startGcode = ko.observable("");
        self.endGcode = ko.observable("");
        self.feedrateDraw = ko.observable(2000);
        self.feedrateTravel = ko.observable(4000);
        self.paperWidth = ko.observable(210);
        self.paperHeight = ko.observable(297);
        self.marginX = ko.observable(15);
        self.marginY = ko.observable(20);
        self.marginRight = ko.observable(15);

        // Standalone Host connection properties
        self.isStandalone = ko.observable(window.location.pathname.indexOf("/plugin/") === -1);
        self.octoprintUrl = ko.observable(safeStorage.getItem("plotter_octoprintUrl") || "http://localhost:5000");
        self.octoprintApiKey = ko.observable(safeStorage.getItem("plotter_octoprintApiKey") || "");

        self.octoprintUrl.subscribe(function(val) {
            safeStorage.setItem("plotter_octoprintUrl", val);
        });
        self.octoprintApiKey.subscribe(function(val) {
            safeStorage.setItem("plotter_octoprintApiKey", val);
        });

        // Bed size & alignment
        self.bedWidth = ko.observable(220);
        self.bedHeight = ko.observable(220);
        self.pageAlignment = ko.observable("top-left");
        self.snapToBedGrid = ko.observable(true);

        // Line detection
        self.useDetectedLines = ko.observable(false);
        self.lineOffset = ko.observable(0.0);
        self.lineDetectionMode = ko.observable("auto"); // "auto" or "manual"
        self.manualLine1Y = ko.observable(50.0);
        self.manualLine2Y = ko.observable(68.0);
        self.autoDetectedLines = ko.observableArray([]);

        self.detectedLines = ko.pureComputed(function() {
            if (self.lineDetectionMode() === "auto") {
                return self.autoDetectedLines();
            } else {
                const y1 = parseFloat(self.manualLine1Y());
                const y2 = parseFloat(self.manualLine2Y());
                const startY = Math.min(y1, y2);
                const spacing = Math.abs(y2 - y1);
                if (spacing < 1) return []; // prevent infinite loop
                const lines = [];
                const pageH = parseFloat(self.paperHeight());
                for (let y = startY; y < pageH; y += spacing) {
                    lines.push(y);
                }
                return lines;
            }
        });



        self.filename = ko.observable("handwriting.gcode");



        // UI state
        self.status = ko.observable("ready");
        self.statusText = ko.observable("Ready");
        self.zoomLevel = ko.observable(1.0);

        self.renderedStrokes = ko.observableArray([]);
        self.totalStrokes = ko.observable(0);
        self.totalLength = ko.observable(0);
        self.totalSize = ko.observable(0);
        self.gcodeContent = "";
        const isStandalone = window.location.pathname.indexOf("/plugin/") === -1;
        const defaultBg = isStandalone 
            ? "octoprint_plotterhandwriting/static/images/default_page.jpg" 
            : "/plugin/plotterhandwriting/static/images/default_page.jpg";
        self.bgImageSrc = ko.observable(defaultBg);
        self.bgX = ko.observable(0);
        self.bgY = ko.observable(0);
        self.bgWidth = ko.observable(210);
        self.bgHeight = ko.observable(297);
        self.bgOpacity = ko.observable(0.75);
        self.bgRotation = ko.observable(0);
        self.showBg = ko.observable(true);

        // Load default custom OTF font on startup
        self.customFontData = null;
        self.customFontName = ko.observable("Myfont-Regular (Loading...)");
        self.hasCustomFont = ko.observable(false);

        const fontUrl = isStandalone 
            ? "octoprint_plotterhandwriting/static/fonts/Myfont-Regular.otf" 
            : "/plugin/plotterhandwriting/static/fonts/Myfont-Regular.otf";

        opentype.load(fontUrl, function(err, font) {
            if (err) {
                console.error("Could not load default custom font from: " + fontUrl, err);
                self.customFontName("Failed to load default font");
            } else {
                self.customFontData = font;
                self.hasCustomFont(true);
                self.customFontName("Myfont-Regular (Default)");
                self.triggerGeneration(); // Force initial render with the default custom font
            }
        });

        // Computed background transform (translation + rotation around top-left corner)
        self.bgTransform = ko.pureComputed(function() {
            return `translate(${self.bgX()}, ${self.bgY()}) rotate(${self.bgRotation()})`;
        });

        // Computed coordinates for bottom-right calibration handle (Dot 2)
        self.handle2X = ko.pureComputed(function() {
            const x1 = parseFloat(self.bgX());
            const w = parseFloat(self.bgWidth());
            const h = parseFloat(self.bgHeight());
            const rotRad = (parseFloat(self.bgRotation()) * Math.PI) / 180.0;
            return x1 + w * Math.cos(rotRad) - h * Math.sin(rotRad);
        });

        self.handle2Y = ko.pureComputed(function() {
            const y1 = parseFloat(self.bgY());
            const w = parseFloat(self.bgWidth());
            const h = parseFloat(self.bgHeight());
            const rotRad = (parseFloat(self.bgRotation()) * Math.PI) / 180.0;
            return y1 + w * Math.sin(rotRad) + h * Math.cos(rotRad);
        });

        // Calibration span in number of lines (default to 5 for higher accuracy)
        self.calibrationSpan = ko.observable(5);

        // Computed Y position of the spacing handle (Dot 2) on the ruled line grid
        self.gridHandle2Y = ko.pureComputed(function() {
            const span = parseInt(self.calibrationSpan() || 1, 10);
            return parseFloat(self.marginY()) + (parseFloat(self.lineSpacing()) * span);
        });

        // Computed X position of the right margin line
        self.rightMarginX = ko.pureComputed(function() {
            return parseFloat(self.paperWidth()) - parseFloat(self.marginRight());
        });

        // Computed lines for ruled paper
        self.ruledLines = ko.pureComputed(function() {
            const lines = [];
            const lSpacing = parseFloat(self.lineSpacing());
            const startY = parseFloat(self.marginY());
            const endY = parseFloat(self.paperHeight()) - parseFloat(self.marginY());
            if (lSpacing <= 0) return lines;
            for (let y = startY; y < endY; y += lSpacing) {
                lines.push({ y: y });
            }
            return lines;
        });

        // Computed lines for grid paper (horizontal & vertical)
        self.gridLinesH = ko.pureComputed(function() {
            const lines = [];
            const endY = parseFloat(self.paperHeight());
            const spacing = 10; // 10mm grid spacing
            for (let y = spacing; y < endY; y += spacing) {
                lines.push({ y: y });
            }
            return lines;
        });

        self.gridLinesV = ko.pureComputed(function() {
            const lines = [];
            const endX = parseFloat(self.paperWidth());
            const spacing = 10; // 10mm grid spacing
            for (let x = spacing; x < endX; x += spacing) {
                lines.push({ x: x });
            }
            return lines;
        });

        // Computed class & zoom
        self.statusClass = ko.pureComputed(function() {
            if (self.status() === "working") return "working";
            if (self.status() === "error") return "error";
            return "ready";
        });

        self.isWorking = ko.pureComputed(function() {
            return self.status() === "working";
        });

        self.paperClass = ko.pureComputed(function() {
            return "paper-sheet paper-" + self.paperType();
        });

        self.paperWidthPx = ko.pureComputed(function() {
            return (self.paperWidth() * 2) + "px";
        });

        self.paperHeightPx = ko.pureComputed(function() {
            return (self.paperHeight() * 2) + "px";
        });

        self.viewBoxString = ko.pureComputed(function() {
            return "0 0 " + self.paperWidth() + " " + self.paperHeight();
        });

        self.zoomTransform = ko.pureComputed(function() {
            return "scale(" + self.zoomLevel() + ")";
        });

        // Zoom actions
        self.zoomIn = function() {
            self.zoomLevel(Math.min(self.zoomLevel() + 0.1, 2.5));
        };
        self.zoomOut = function() {
            self.zoomLevel(Math.max(self.zoomLevel() - 0.1, 0.4));
        };
        self.zoomReset = function() {
            self.zoomLevel(1.0);
        };

        // Bed bounds computed variables for the SVG preview overlay
        self.bedBoundsX = ko.pureComputed(function() {
            return 0;
        });
        self.bedBoundsY = ko.pureComputed(function() {
            if (self.pageAlignment() === "top-left") {
                return 0;
            } else {
                return parseFloat(self.paperHeight()) - parseFloat(self.bedHeight());
            }
        });

        // Scale detected lines proportionally when paperHeight changes
        let oldPaperHeight = parseFloat(self.paperHeight());
        self.paperHeight.subscribe(function(newVal) {
            const newHeight = parseFloat(newVal);
            if (oldPaperHeight > 0 && newHeight > 0 && self.autoDetectedLines().length > 0) {
                const ratio = newHeight / oldPaperHeight;
                const scaled = self.autoDetectedLines().map(function(y) { return y * ratio; });
                self.autoDetectedLines(scaled);
            }
            oldPaperHeight = newHeight;
        });

        // File reader handler for background calibration photo with page line and margin detection
        self.onBgFileSelected = function(vm, event) {
            const file = event.target.files[0];
            if (!file) return;
            
            const reader = new FileReader();
            reader.onload = function(e) {
                const dataUrl = e.target.result;
                self.bgImageSrc(dataUrl);
                self.showBg(true);
                // Auto-scale background width to paper width
                self.bgWidth(self.paperWidth());
                self.bgHeight(self.paperHeight());
                self.bgX(0);
                self.bgY(0);
                self.bgRotation(0);

                // Run automatic lines and margin detection
                self.status("working");
                self.statusText("Detecting page guides...");
                detectPageGuidesFromImage(dataUrl, parseFloat(self.paperWidth()), parseFloat(self.paperHeight()), function(guides) {
                    self.status("ready");
                    self.statusText("Ready");
                    
                    let notifyText = "";
                    if (guides.lines && guides.lines.length > 0) {
                        self.autoDetectedLines(guides.lines);
                        self.useDetectedLines(true); // Auto enable line alignment
                        notifyText += "Detected " + guides.lines.length + " lines automatically.";
                    } else {
                        self.autoDetectedLines([]);
                        self.useDetectedLines(false);
                        notifyText += "No horizontal lines detected.";
                    }

                    if (guides.marginX !== null) {
                        const alignedMargin = Math.round(guides.marginX + 3.0);
                        self.marginX(alignedMargin);
                        notifyText += " Left margin line detected at " + Math.round(guides.marginX) + "mm (aligned text to " + alignedMargin + "mm).";
                    }

                    if (guides.lines && guides.lines.length > 0) {
                        new PNotify({
                            title: "Page Guides Detected",
                            text: notifyText,
                            type: "success"
                        });
                    } else {
                        new PNotify({
                            title: "Guide Detection",
                            text: "No clear horizontal baselines found. Try adjusting contrast or lighting.",
                            type: "notice"
                        });
                    }
                    self.triggerGeneration();
                });
            };
            reader.readAsDataURL(file);
        };
        
        self.clearBgImage = function() {
            self.bgImageSrc("");
            self.autoDetectedLines([]);
            self.useDetectedLines(false);
            $("#bgFileInput").val("");
            self.triggerGeneration();
        };

        // File reader handler for custom TrueType/OpenType font files
        self.onFontFileSelected = function(vm, event) {
            const file = event.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const arrayBuffer = e.target.result;
                    self.customFontData = opentype.parse(arrayBuffer);
                    self.hasCustomFont(true);
                    self.customFontName(file.name);
                    self.selectedFont("custom"); // Automatically select custom font
                    self.triggerGeneration();
                    new PNotify({
                        title: "Font Loaded",
                        text: "Successfully loaded custom font: " + file.name,
                        type: "success"
                    });
                } catch (err) {
                    console.error("Error parsing font:", err);
                    new PNotify({
                        title: "Font Load Error",
                        text: "Could not parse font file. Ensure it is a valid TTF or OTF file.",
                        type: "error"
                    });
                }
            };
            reader.readAsArrayBuffer(file);
        };

        self.clearCustomFont = function() {
            self.customFontData = null;
            self.hasCustomFont(false);
            self.customFontName("No Custom Font Loaded");
            self.selectedFont("cursive"); // Reset to default cursive Hershey font
            $("#fontFileInput").val("");
            self.triggerGeneration();
        };

        // Auto update G-code filename
        self.text.subscribe(function() {
            if (self.filename() === "handwriting.gcode") {
                self.filename("handwriting_" + Date.now().toString().slice(-6) + ".gcode");
            }
        });

        // Core Handwriting Generator
        self.generateHandwriting = function() {
            const fontName = self.selectedFont();
            let fontData = null;
            if (fontName === "custom") {
                if (!self.customFontData) {
                    self.status("error");
                    self.statusText("No Custom Font Loaded");
                    return;
                }
            } else {
                fontData = HERSHEY_FONTS[fontName];
                if (!fontData) {
                    self.status("error");
                    self.statusText("Font not found");
                    return;
                }
            }

            const textVal = self.text();
            const fSize = parseFloat(self.fontSize());
            const lSpacing = parseFloat(self.lineSpacing());
            
            const scaleBase = fSize / 21.0;
            
            const startX = parseFloat(self.marginX());
            const startY = parseFloat(self.marginY()); // Baseline Y of the first line
            const limitX = parseFloat(self.paperWidth()) - parseFloat(self.marginRight());
            const limitY = parseFloat(self.paperHeight()) - parseFloat(self.marginY());

            // Humanization multipliers
            const driftMult = parseFloat(self.driftIntensity()) / 100.0 * 2.0; 
            const tremorMult = parseFloat(self.tremorIntensity()) / 100.0 * 0.3; 
            const sizeJitterMult = parseFloat(self.sizeJitter()) / 100.0;
            const spacingJitterMult = parseFloat(self.spacingJitter()) / 100.0;
            const slantJitterMult = parseFloat(self.slantJitter()) / 100.0;
            const hookMult = parseFloat(self.hookIntensity()) / 100.0 * 0.8; 
            
            // Morph scale (alternate deforms): max 1.5 units on raw coordinates (scales up to ~0.7mm)
            const morphScale = parseFloat(self.morphIntensity()) / 100.0 * 1.5;

            const baseSlant = (parseFloat(self.baseSlantDeg()) * Math.PI) / 180.0;

            const strokesOutput = [];
            let driftAngle = 0.0;
            const paragraphs = textVal.split("\n");

            const useLines = self.useDetectedLines() && self.detectedLines().length > 0;
            const detLines = self.detectedLines();
            const lineOffsetMm = parseFloat(self.lineOffset());

            function getCurrentLineY(idx) {
                if (useLines) {
                    if (idx < detLines.length) {
                        return detLines[idx] + lineOffsetMm;
                    } else {
                        // Fallback after running out of detected lines
                        const lastDetectedY = detLines[detLines.length - 1];
                        return lastDetectedY + lineOffsetMm + (idx - detLines.length + 1) * lSpacing;
                    }
                } else {
                    return startY + idx * lSpacing;
                }
            }

            let lineIndex = 0;
            let currentX = startX;
            let currentY = getCurrentLineY(0);

            for (let p = 0; p < paragraphs.length; p++) {
                const paragraph = paragraphs[p];
                if (paragraph.trim() === "" && p > 0) {
                    lineIndex++;
                    currentY = getCurrentLineY(lineIndex);
                    currentX = startX;
                    continue;
                }

                currentY = getCurrentLineY(lineIndex);

                const words = paragraph.split(" ");
                for (let w = 0; w < words.length; w++) {
                    const word = words[w];
                    if (word === "") {
                        currentX += 6 * scaleBase;
                        continue;
                    }

                    // Pre-calculate word width
                    let wordWidth = 0;
                    for (let c = 0; c < word.length; c++) {
                        const char = word[c];
                        let wWidth = 12;
                        if (fontName === "custom" && self.customFontData) {
                            const glyph = self.customFontData.charToGlyph(char);
                            wWidth = glyph ? glyph.advanceWidth * (21.0 / self.customFontData.unitsPerEm) : 12;
                        } else {
                            const charObj = fontData ? fontData.chars[char.charCodeAt(0) - 33] : null;
                            wWidth = charObj ? charObj.o : 12;
                        }
                        wordWidth += wWidth * scaleBase;
                    }

                    // Word wrap check
                    if (currentX + wordWidth > limitX && currentX > startX) {
                        currentX = startX;
                        lineIndex++;
                        currentY = getCurrentLineY(lineIndex);
                    }

                    if (currentY > limitY) break;

                    for (let c = 0; c < word.length; c++) {
                        const char = word[c];
                        const code = char.charCodeAt(0);
                        
                        if (code === 32) {
                            currentX += 8 * scaleBase;
                            continue;
                        }

                        let characterStrokes = [];
                        let charWidth = 12;

                        if (fontName === "custom" && self.customFontData) {
                            const baseGlyph = self.customFontData.charToGlyph(char);
                            if (baseGlyph) {
                                const baseName = baseGlyph.name;
                                const variants = [baseGlyph];
                                if (baseName) {
                                    const glyphs = self.customFontData.glyphs.glyphs;
                                    for (const key in glyphs) {
                                        if (glyphs.hasOwnProperty(key)) {
                                            const g = glyphs[key];
                                            if (g && g.name && g.name !== baseName && g.name.startsWith(baseName + ".")) {
                                                variants.push(g);
                                            }
                                        }
                                    }
                                }
                                // Randomly select from glyph alternates (e.g. Calligraphr multiple iterations)
                                const glyph = variants[Math.floor(Math.random() * variants.length)];
                                charWidth = glyph.advanceWidth * (21.0 / self.customFontData.unitsPerEm);
                                const path = glyph.getPath(0, 0, 21.0);
                                characterStrokes = convertPathToStrokes(path, self.skeletonMode());
                            }
                        } else {
                            const charObj = fontData.chars[code - 33];
                            if (charObj) {
                                charWidth = charObj.o;
                                characterStrokes = parseSVGPath(charObj.d);
                            }
                        }

                        if (characterStrokes.length === 0) {
                            currentX += charWidth * scaleBase;
                            continue;
                        }

                        // Jitter per character
                        const charScale = scaleBase * (1.0 + randomRange(-sizeJitterMult, sizeJitterMult));
                        const charSlant = baseSlant + randomRange(-slantJitterMult, slantJitterMult) * 0.15;
                        const charXJitter = randomRange(-0.2, 0.2) * (parseFloat(self.spacingJitter()) / 100.0);
                        const charYJitter = randomRange(-0.2, 0.2) * (parseFloat(self.sizeJitter()) / 100.0);

                        driftAngle += randomRange(0.15, 0.35);
                        const lineDrift = Math.sin(driftAngle) * driftMult + randomRange(-0.1, 0.1) * driftMult;

                        // Generate unique random Morph deforms for this character instance
                        // Top shift rx1/ry1, bottom shift rx2/ry2
                        const rx1 = randomRange(-morphScale, morphScale);
                        const rx2 = randomRange(-morphScale, morphScale);
                        const ry1 = randomRange(-morphScale, morphScale);
                        const ry2 = randomRange(-morphScale, morphScale);

                        for (let s = 0; s < characterStrokes.length; s++) {
                            const stroke = characterStrokes[s];
                            if (stroke.length === 0) continue;

                            const transformedStroke = [];

                            // Subdivide strokes for Tremor
                            const subdividedStroke = [];
                            for (let pt = 0; pt < stroke.length - 1; pt++) {
                                const p1 = stroke[pt];
                                const p2 = stroke[pt + 1];
                                const segmentLen = Math.hypot(p2.x - p1.x, p2.y - p1.y) * charScale;
                                
                                subdividedStroke.push(p1);
                                if (segmentLen > 1.2 && tremorMult > 0) {
                                    const divisions = Math.max(2, Math.ceil(segmentLen / 0.8));
                                    for (let div = 1; div < divisions; div++) {
                                        const ratio = div / divisions;
                                        subdividedStroke.push({
                                            x: p1.x + (p2.x - p1.x) * ratio,
                                            y: p1.y + (p2.y - p1.y) * ratio
                                        });
                                    }
                                }
                            }
                            if (stroke.length > 0) {
                                subdividedStroke.push(stroke[stroke.length - 1]);
                            }

                            // Transform each vertex in the stroke
                            for (let pt = 0; pt < subdividedStroke.length; pt++) {
                                const ptRaw = subdividedStroke[pt];

                                // Hershey baseline is at Y=22. Custom font baseline is at Y=0.
                                const dx = ptRaw.x;
                                const dy = (fontName === "custom") ? ptRaw.y : ptRaw.y - 22;

                                // Apply Procedural Glyphic Morphing (Alternate shape variations)
                                // t goes from 0 (top) to 1 (bottom)
                                const t = (fontName === "custom") ? Math.max(0, Math.min(1, (ptRaw.y + 16) / 21.0)) : Math.max(0, Math.min(1, (ptRaw.y - 1) / 21.0));
                                const mx = (1 - t) * rx1 + t * rx2;
                                const my = (1 - t) * ry1 + t * ry2;

                                // 1. Scale with morph offset added to raw font coordinate
                                let tx = (dx + mx) * charScale;
                                let ty = (dy + my) * charScale;

                                // 2. Slant (shear X based on Y)
                                tx = tx - ty * Math.tan(charSlant);

                                // 3. Translation
                                let x = currentX + tx + charXJitter;
                                let y = currentY + ty + charYJitter + lineDrift;

                                // 4. Tremor Wave Noise (continuous per stroke index)
                                if (tremorMult > 0) {
                                    const waveX = Math.sin(pt * 1.6) * tremorMult + Math.cos(pt * 0.7) * tremorMult * 0.3;
                                    const waveY = Math.cos(pt * 2.1) * tremorMult + Math.sin(pt * 0.9) * tremorMult * 0.3;
                                    x += waveX;
                                    y += waveY;
                                }

                                transformedStroke.push({ x, y });
                            }

                            // Entry/Exit pen lowered drags (Hooks)
                            if (hookMult > 0 && transformedStroke.length > 1) {
                                if (s === 0) {
                                    const p0 = transformedStroke[0];
                                    const p1 = transformedStroke[1];
                                    const entryHook = {
                                        x: p0.x - (p1.x - p0.x) * hookMult * 0.8 + randomRange(-0.1, 0.1) * hookMult,
                                        y: p0.y + hookMult * 0.8 + randomRange(-0.1, 0.1) * hookMult
                                    };
                                    transformedStroke.unshift(entryHook);
                                }
                                if (s === characterStrokes.length - 1) {
                                    const pn = transformedStroke[transformedStroke.length - 1];
                                    const pn_1 = transformedStroke[transformedStroke.length - 2];
                                    const exitHook = {
                                        x: pn.x + (pn.x - pn_1.x) * hookMult * 0.6 + randomRange(-0.1, 0.1) * hookMult,
                                        y: pn.y - hookMult * 0.5 + randomRange(-0.1, 0.1) * hookMult
                                    };
                                    transformedStroke.push(exitHook);
                                }
                            }

                            transformedStroke.isTravel = false;
                            strokesOutput.push(transformedStroke);
                        }

                        currentX += charWidth * charScale * (1.0 + randomRange(-spacingJitterMult, spacingJitterMult));
                    }

                    currentX += 8 * scaleBase * (1.0 + randomRange(-spacingJitterMult, spacingJitterMult));
                }

                currentX = startX;
                lineIndex++;
                currentY = getCurrentLineY(lineIndex);
                if (currentY > limitY) break;
            }

            // Convert to SVG paths
            const svgStrokes = strokesOutput.map(function(stroke) {
                let d = "";
                for (let i = 0; i < stroke.length; i++) {
                    const p = stroke[i];
                    d += (i === 0 ? "M" : "L") + p.x.toFixed(2) + "," + p.y.toFixed(2) + " ";
                }
                return { pathData: d };
            });

            self.renderedStrokes(svgStrokes);
            self.totalStrokes(strokesOutput.length);

            self.compileGCode(strokesOutput);
            self.status("ready");
            self.statusText("Ready");
        };

        // G-Code Compiler
        self.compileGCode = function(strokes) {
            const paperH = parseFloat(self.paperHeight());
            const bedH = parseFloat(self.bedHeight());
            const alignment = self.pageAlignment();
            const feedDraw = parseInt(self.feedrateDraw());
            const feedTravel = parseInt(self.feedrateTravel());

            function toGcodeY(y) {
                if (alignment === "top-left") {
                    return bedH - y;
                } else {
                    return paperH - y;
                }
            }

            let gcode = "; G-Code Generated by OctoPrint Pen Plotter Handwriting\n";
            gcode += "; Font: " + self.selectedFont() + "\n";
            gcode += "; Total Strokes: " + strokes.length + "\n\n";

            gcode += self.startGcode() + "\n\n";

            let totalLen = 0.0;
            let lastX = 0.0;
            let lastY = 0.0;
            let initialized = false;

            for (let s = 0; s < strokes.length; s++) {
                const stroke = strokes[s];
                if (stroke.length === 0) continue;

                const startPt = stroke[0];
                const startGcodeY = toGcodeY(startPt.y);

                gcode += "; --- Stroke " + (s + 1) + " ---\n";
                gcode += self.penUpCommand() + "\n";
                gcode += `G0 X${startPt.x.toFixed(2)} Y${startGcodeY.toFixed(2)} F${feedTravel}\n`;

                if (initialized) {
                    totalLen += Math.hypot(startPt.x - lastX, startPt.y - lastY);
                }
                lastX = startPt.x;
                lastY = startPt.y;
                initialized = true;

                gcode += self.penDownCommand() + "\n";

                for (let i = 1; i < stroke.length; i++) {
                    const pt = stroke[i];
                    const gcodeY = toGcodeY(pt.y);

                    gcode += `G1 X${pt.x.toFixed(2)} Y${gcodeY.toFixed(2)} F${feedDraw}\n`;
                    totalLen += Math.hypot(pt.x - lastX, pt.y - lastY);
                    
                    lastX = pt.x;
                    lastY = pt.y;
                }
            }

            gcode += "\n" + self.penUpCommand() + "\n";
            gcode += self.endGcode() + "\n";

            self.gcodeContent = gcode;
            self.totalLength(Math.round(totalLen));
            self.totalSize(gcode.length);
        };

        // Interactive Manual Line Calibration Draggable Handles
        self.activeDragHandle = null; // can be "line1" or "line2"

        self.startDragLine1 = function(data, event) {
            self.activeDragHandle = "line1";
            if (event.preventDefault) event.preventDefault();
            return false;
        };

        self.startDragLine2 = function(data, event) {
            self.activeDragHandle = "line2";
            if (event.preventDefault) event.preventDefault();
            return false;
        };

        window.addEventListener("mousemove", function(e) {
            if (!self.activeDragHandle) return;
            const svgElement = document.querySelector(".paper-svg");
            if (!svgElement) return;

            const pt = svgElement.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;

            try {
                const cursorpt = pt.matrixTransform(svgElement.getScreenCTM().inverse());
                let targetY = cursorpt.y;

                const maxH = parseFloat(self.paperHeight());
                if (targetY < 0) targetY = 0;
                if (targetY > maxH) targetY = maxH;

                // Snap to nearest auto-detected line (if within 3mm)
                if (self.autoDetectedLines().length > 0) {
                    const threshold = 3.0;
                    let nearestLine = null;
                    let minDiff = 999;

                    self.autoDetectedLines().forEach(function(lineY) {
                        const diff = Math.abs(lineY - targetY);
                        if (diff < minDiff) {
                            minDiff = diff;
                            nearestLine = lineY;
                        }
                    });

                    if (nearestLine !== null && minDiff < threshold) {
                        targetY = nearestLine;
                    }
                }

                targetY = Math.round(targetY * 100) / 100;

                if (self.activeDragHandle === "line1") {
                    self.manualLine1Y(targetY);
                } else if (self.activeDragHandle === "line2") {
                    self.manualLine2Y(targetY);
                }
                self.triggerGeneration();
            } catch (err) {}
        });

        window.addEventListener("mouseup", function() {
            if (self.activeDragHandle) {
                self.activeDragHandle = null;
                self.saveSettings();
            }
        });

        window.addEventListener("touchmove", function(e) {
            if (!self.activeDragHandle || e.touches.length === 0) return;
            const touch = e.touches[0];
            const svgElement = document.querySelector(".paper-svg");
            if (!svgElement) return;

            const pt = svgElement.createSVGPoint();
            pt.x = touch.clientX;
            pt.y = touch.clientY;

            try {
                const cursorpt = pt.matrixTransform(svgElement.getScreenCTM().inverse());
                let targetY = cursorpt.y;

                const maxH = parseFloat(self.paperHeight());
                if (targetY < 0) targetY = 0;
                if (targetY > maxH) targetY = maxH;

                if (self.autoDetectedLines().length > 0) {
                    const threshold = 3.0;
                    let nearestLine = null;
                    let minDiff = 999;

                    self.autoDetectedLines().forEach(function(lineY) {
                        const diff = Math.abs(lineY - targetY);
                        if (diff < minDiff) {
                            minDiff = diff;
                            nearestLine = lineY;
                        }
                    });

                    if (nearestLine !== null && minDiff < threshold) {
                        targetY = nearestLine;
                    }
                }

                targetY = Math.round(targetY * 100) / 100;

                if (self.activeDragHandle === "line1") {
                    self.manualLine1Y(targetY);
                } else if (self.activeDragHandle === "line2") {
                    self.manualLine2Y(targetY);
                }
                self.triggerGeneration();
            } catch (err) {}
        }, { passive: false });

        window.addEventListener("touchend", function() {
            if (self.activeDragHandle) {
                self.activeDragHandle = null;
                self.saveSettings();
            }
        });

        // Debounce Trigger
        self.generationTimeout = null;
        self.triggerGeneration = function() {
            if (self.generationTimeout) {
                clearTimeout(self.generationTimeout);
            }
            self.status("working");
            self.statusText("Rendering...");
            self.generationTimeout = setTimeout(function() {
                self.generateHandwriting();
            }, 150);
        };

        // Watch parameters
        const observablesToWatch = [
            self.text, self.selectedFont, self.fontSize, self.lineSpacing,
            self.baseSlantDeg, self.driftIntensity, self.tremorIntensity,
            self.sizeJitter, self.spacingJitter, self.slantJitter, self.hookIntensity,
            self.morphIntensity, self.paperWidth, self.paperHeight, self.marginX, self.marginY,
            self.penUpCommand, self.penDownCommand, self.startGcode, self.endGcode,
            self.feedrateDraw, self.feedrateTravel,
            self.bedWidth, self.bedHeight, self.pageAlignment, self.snapToBedGrid,
            self.useDetectedLines, self.lineOffset,
            self.lineDetectionMode, self.manualLine1Y, self.manualLine2Y
        ];
        
        ko.utils.arrayForEach(observablesToWatch, function(obs) {
            obs.subscribe(self.triggerGeneration);
        });

        // Initialize settings
        self.onBeforeBinding = function() {
            if (self.settingsViewModel && self.settingsViewModel.settings && self.settingsViewModel.settings.plugins && self.settingsViewModel.settings.plugins.plotterhandwriting) {
                var settings = self.settingsViewModel.settings.plugins.plotterhandwriting;
                self.penUpCommand(settings.pen_up_gcode());
                self.penDownCommand(settings.pen_down_gcode());
                self.startGcode(settings.start_gcode());
                self.endGcode(settings.end_gcode());
                self.feedrateDraw(parseInt(settings.feedrate_draw()));
                self.feedrateTravel(parseInt(settings.feedrate_travel()));
                self.selectedFont(settings.default_font());
                self.fontSize(parseFloat(settings.font_size()));
                self.lineSpacing(parseFloat(settings.line_spacing()));
                self.paperWidth(210);
                self.paperHeight(297);
                self.marginX(parseFloat(settings.margin_x()));
                self.marginY(parseFloat(settings.margin_y()));
                if (settings.margin_right) self.marginRight(parseFloat(settings.margin_right()));
                if (settings.pen_thickness) self.penThickness(parseFloat(settings.pen_thickness()));

                self.bedWidth(220);
                self.bedHeight(220);
                if (settings.page_alignment) self.pageAlignment(settings.page_alignment());
                if (settings.snap_to_bed_grid) self.snapToBedGrid(settings.snap_to_bed_grid());
                if (settings.use_detected_lines) self.useDetectedLines(settings.use_detected_lines());
                if (settings.line_offset) self.lineOffset(parseFloat(settings.line_offset()));
                if (settings.line_detection_mode) self.lineDetectionMode(settings.line_detection_mode());
                if (settings.manual_line1_y) self.manualLine1Y(parseFloat(settings.manual_line1_y()));
                if (settings.manual_line2_y) self.manualLine2Y(parseFloat(settings.manual_line2_y()));
            }
            self.generateHandwriting();
        };

        self.saveSettings = function() {
            if (!self.settingsViewModel) return;
            var data = {
                plugins: {
                    plotterhandwriting: {
                        pen_up_gcode: self.penUpCommand(),
                        pen_down_gcode: self.penDownCommand(),
                        start_gcode: self.startGcode(),
                        end_gcode: self.endGcode(),
                        feedrate_draw: parseInt(self.feedrateDraw()),
                        feedrate_travel: parseInt(self.feedrateTravel()),
                        default_font: self.selectedFont(),
                        font_size: parseFloat(self.fontSize()),
                        line_spacing: self.lineSpacing(),
                        paper_width: 210,
                        paper_height: 297,
                        margin_x: parseFloat(self.marginX()),
                        margin_y: parseFloat(self.marginY()),
                        margin_right: parseFloat(self.marginRight()),
                        pen_thickness: parseFloat(self.penThickness()),
                        bed_width: 220,
                        bed_height: 220,
                        page_alignment: self.pageAlignment(),
                        snap_to_bed_grid: self.snapToBedGrid(),
                        use_detected_lines: self.useDetectedLines(),
                        line_offset: parseFloat(self.lineOffset()),
                        line_detection_mode: self.lineDetectionMode(),
                        manual_line1_y: parseFloat(self.manualLine1Y()),
                        manual_line2_y: parseFloat(self.manualLine2Y())
                    }
                }
            };
            OctoPrint.settings.save(data)
                .done(function() {
                    console.log("Plotter Handwriting settings saved.");
                });
        };

        self.generateAndSaveLocally = function() {
            self.saveSettings();
            const blob = new Blob([self.gcodeContent], { type: "text/plain;charset=utf-8" });
            const link = document.createElement("a");
            link.href = URL.createObjectURL(blob);
            link.download = self.filename();
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        };

        self.uploadFile = function(startPrint, callback) {
            self.saveSettings();
            self.status("working");
            self.statusText("Uploading...");

            const gcodeText = self.gcodeContent;
            const filename = self.filename();
            
            const formData = new FormData();
            const blob = new Blob([gcodeText], { type: "text/plain" });
            formData.append("file", blob, filename);
            formData.append("select", "true");
            if (startPrint) {
                formData.append("print", "true");
            }

            let uploadUrl;
            let headers = {};

            if (self.isStandalone()) {
                let host = self.octoprintUrl().trim();
                if (host.endsWith("/")) {
                    host = host.slice(0, -1);
                }
                uploadUrl = host + "/api/files/local";
                headers["X-Api-Key"] = self.octoprintApiKey().trim();
            } else {
                uploadUrl = OctoPrint.getApiUrl("files/local");
            }

            $.ajax({
                url: uploadUrl,
                type: "POST",
                headers: headers,
                data: formData,
                processData: false,
                contentType: false,
                success: function(response) {
                    self.status("ready");
                    self.statusText("Ready");
                    if (callback) callback();
                    
                    new PNotify({
                        title: "Handwriting Plotter",
                        text: "G-Code uploaded: " + filename + (startPrint ? " (Printing started)" : ""),
                        type: "success"
                    });
                },
                error: function(xhr, status, error) {
                    self.status("error");
                    self.statusText("Failed");
                    new PNotify({
                        title: "Upload Failed",
                        text: xhr.responseText || error || "Could not connect to OctoPrint. Check CORS or URL/Key.",
                        type: "error"
                    });
                }
            });
        };

        self.uploadToOctoPrint = function() {
            self.uploadFile(false);
        };

        self.uploadAndPrint = function() {
            const filename = self.filename();
            const confirmPrint = confirm("Are you sure you want to upload and print '" + filename + "' immediately?");
            if (confirmPrint) {
                self.uploadFile(true);
            }
        };

        // Helper to convert screen coordinates to SVG units (mm)
        function getSVGCoords(svgElement, clientX, clientY) {
            const pt = svgElement.createSVGPoint();
            pt.x = clientX;
            pt.y = clientY;
            const svgMatrix = svgElement.getScreenCTM().inverse();
            const transformed = pt.matrixTransform(svgMatrix);
            return { x: transformed.x, y: transformed.y };
        }

        // Setup mouse/touch drag handlers for calibration template handles (Dot 1 and Dot 2)
        self.setupDragging = function(element) {
            const svg = element.querySelector(".paper-svg");
            if (!svg) return;

            let activeHandle = null;
            let startCoords = null;
            let startMarginX = 0;
            let startMarginY = 0;
            let startMarginRight = 0;
            let startLineSpacing = 0;

            const getEventCoords = function(e) {
                let clientX = 0;
                let clientY = 0;
                const orig = e.originalEvent || e;
                if (orig.touches && orig.touches.length > 0) {
                    clientX = orig.touches[0].clientX;
                    clientY = orig.touches[0].clientY;
                } else if (orig.changedTouches && orig.changedTouches.length > 0) {
                    clientX = orig.changedTouches[0].clientX;
                    clientY = orig.changedTouches[0].clientY;
                } else {
                    clientX = e.clientX !== undefined ? e.clientX : (orig.clientX || 0);
                    clientY = e.clientY !== undefined ? e.clientY : (orig.clientY || 0);
                }
                return { x: clientX, y: clientY };
            };

            const onMouseDown = function(e) {
                const target = e.target;
                if (target.classList.contains("grid-handle-anchor")) {
                    activeHandle = "anchor";
                } else if (target.classList.contains("grid-handle-spacing") || target.classList.contains("draggable-spacing-line")) {
                    activeHandle = "spacing";
                } else if (target.classList.contains("draggable-margin-line")) {
                    activeHandle = "margin-line";
                } else if (target.classList.contains("draggable-right-margin-line")) {
                    activeHandle = "right-margin-line";
                } else if (target.classList.contains("draggable-anchor-line")) {
                    activeHandle = "anchor-line";
                } else {
                    return;
                }

                e.preventDefault();
                const screenCoords = getEventCoords(e);
                startCoords = getSVGCoords(svg, screenCoords.x, screenCoords.y);
                if (isNaN(startCoords.x) || isNaN(startCoords.y)) {
                    activeHandle = null;
                    return;
                }

                startMarginX = parseFloat(self.marginX() || 0);
                startMarginY = parseFloat(self.marginY() || 0);
                startMarginRight = parseFloat(self.marginRight() || 0);
                startLineSpacing = parseFloat(self.lineSpacing() || 0);

                $(window).on("mousemove.calibration touchmove.calibration", onMouseMove);
                $(window).on("mouseup.calibration touchend.calibration", onMouseUp);
            };

            const onMouseMove = function(e) {
                if (!activeHandle) return;

                const screenCoords = getEventCoords(e);
                const coords = getSVGCoords(svg, screenCoords.x, screenCoords.y);
                if (isNaN(coords.x) || isNaN(coords.y)) return;

                self.useDetectedLines(false); // Turn off auto snapper

                if (activeHandle === "anchor") {
                    const dx = coords.x - startCoords.x;
                    const dy = coords.y - startCoords.y;
                    const newMarginX = Math.round((startMarginX + dx) * 10) / 10;
                    const newMarginY = Math.round((startMarginY + dy) * 10) / 10;
                    self.marginX(Math.max(0, Math.min(210, newMarginX)));
                    self.marginY(Math.max(0, Math.min(297, newMarginY)));
                } else if (activeHandle === "margin-line") {
                    const dx = coords.x - startCoords.x;
                    const newMarginX = Math.round((startMarginX + dx) * 10) / 10;
                    self.marginX(Math.max(0, Math.min(210, newMarginX)));
                } else if (activeHandle === "right-margin-line") {
                    const dx = coords.x - startCoords.x;
                    const newMarginRight = Math.round((startMarginRight - dx) * 10) / 10;
                    self.marginRight(Math.max(0, Math.min(150, newMarginRight)));
                } else if (activeHandle === "anchor-line") {
                    const dy = coords.y - startCoords.y;
                    const newMarginY = Math.round((startMarginY + dy) * 10) / 10;
                    self.marginY(Math.max(0, Math.min(297, newMarginY)));
                } else if (activeHandle === "spacing") {
                    const y1 = parseFloat(self.marginY() || 0);
                    const dy = coords.y - y1;
                    const span = parseInt(self.calibrationSpan() || 1, 10);
                    const rawSpacing = dy / span;
                    self.lineSpacing(Math.max(2, Math.min(100, Math.round(rawSpacing * 10) / 10)));
                }
            };

            const onMouseUp = function() {
                activeHandle = null;
                $(window).off(".calibration");
            };

            // Remove previous event listeners just in case
            $(element).off("mousedown.calibration touchstart.calibration");
            $(element).on("mousedown.calibration touchstart.calibration", onMouseDown);
        };

        // Profiles Functions
        self.loadSavedProfiles = function() {
            const data = safeStorage.getItem("plotter_handwriting_profiles");
            if (data) {
                try {
                    self.savedProfiles(JSON.parse(data));
                } catch(e) {
                    self.savedProfiles([]);
                }
            } else {
                // Add default profiles
                const defaults = [
                    {
                        name: "Default ruled notebook",
                        settings: {
                            fontSize: 10, lineSpacing: 18, baseSlantDeg: 8, marginX: 15, marginRight: 15, marginY: 20,
                            driftIntensity: 25, tremorIntensity: 15, sizeJitter: 10, spacingJitter: 15, slantJitter: 15, hookIntensity: 20,
                            paperType: "ruled", calibrationSpan: 5
                        }
                    }
                ];
                self.savedProfiles(defaults);
                safeStorage.setItem("plotter_handwriting_profiles", JSON.stringify(defaults));
            }
        };

        self.saveProfile = function() {
            const name = self.newProfileName().trim();
            if (!name) return;
            
            const newProfile = {
                name: name,
                settings: {
                    fontSize: parseFloat(self.fontSize()),
                    lineSpacing: parseFloat(self.lineSpacing()),
                    baseSlantDeg: parseFloat(self.baseSlantDeg()),
                    marginX: parseFloat(self.marginX()),
                    marginRight: parseFloat(self.marginRight()),
                    marginY: parseFloat(self.marginY()),
                    driftIntensity: parseFloat(self.driftIntensity()),
                    tremorIntensity: parseFloat(self.tremorIntensity()),
                    sizeJitter: parseFloat(self.sizeJitter()),
                    spacingJitter: parseFloat(self.spacingJitter()),
                    slantJitter: parseFloat(self.slantJitter()),
                    hookIntensity: parseFloat(self.hookIntensity()),
                    paperType: self.paperType(),
                    calibrationSpan: parseInt(self.calibrationSpan(), 10),
                    penUpCommand: self.penUpCommand(),
                    penDownCommand: self.penDownCommand(),
                    feedrateDraw: parseFloat(self.feedrateDraw()),
                    feedrateTravel: parseFloat(self.feedrateTravel()),
                    snapToBedGrid: self.snapToBedGrid(),
                    lineDetectionMode: self.lineDetectionMode(),
                    manualLine1Y: parseFloat(self.manualLine1Y()),
                    manualLine2Y: parseFloat(self.manualLine2Y()),
                    penThickness: parseFloat(self.penThickness())
                }
            };
            
            const list = self.savedProfiles().filter(p => p.name !== name);
            list.push(newProfile);
            self.savedProfiles(list);
            safeStorage.setItem("plotter_handwriting_profiles", JSON.stringify(list));
            
            self.newProfileName("");
            self.selectedProfile(name);
            
            if (typeof PNotify !== "undefined") {
                new PNotify({
                    title: "Profile Saved",
                    text: "Profile '" + name + "' successfully saved.",
                    type: "success"
                });
            }
        };

        self.applyProfile = function(profileName) {
            if (!profileName) return;
            const profile = self.savedProfiles().find(p => p.name === profileName);
            if (!profile) return;
            
            const s = profile.settings;
            if (s.fontSize !== undefined) self.fontSize(s.fontSize);
            if (s.lineSpacing !== undefined) self.lineSpacing(s.lineSpacing);
            if (s.baseSlantDeg !== undefined) self.baseSlantDeg(s.baseSlantDeg);
            if (s.marginX !== undefined) self.marginX(s.marginX);
            if (s.marginRight !== undefined) self.marginRight(s.marginRight);
            if (s.marginY !== undefined) self.marginY(s.marginY);
            if (s.driftIntensity !== undefined) self.driftIntensity(s.driftIntensity);
            if (s.tremorIntensity !== undefined) self.tremorIntensity(s.tremorIntensity);
            if (s.sizeJitter !== undefined) self.sizeJitter(s.sizeJitter);
            if (s.spacingJitter !== undefined) self.spacingJitter(s.spacingJitter);
            if (s.slantJitter !== undefined) self.slantJitter(s.slantJitter);
            if (s.hookIntensity !== undefined) self.hookIntensity(s.hookIntensity);
            if (s.paperType !== undefined) self.paperType(s.paperType);
            if (s.calibrationSpan !== undefined) self.calibrationSpan(s.calibrationSpan);
            if (s.penUpCommand !== undefined) self.penUpCommand(s.penUpCommand);
            if (s.penDownCommand !== undefined) self.penDownCommand(s.penDownCommand);
            if (s.feedrateDraw !== undefined) self.feedrateDraw(s.feedrateDraw);
            if (s.feedrateTravel !== undefined) self.feedrateTravel(s.feedrateTravel);
            if (s.snapToBedGrid !== undefined) self.snapToBedGrid(s.snapToBedGrid);
            if (s.lineDetectionMode !== undefined) self.lineDetectionMode(s.lineDetectionMode);
            if (s.manualLine1Y !== undefined) self.manualLine1Y(s.manualLine1Y);
            if (s.manualLine2Y !== undefined) self.manualLine2Y(s.manualLine2Y);
            if (s.penThickness !== undefined) self.penThickness(s.penThickness);
            
            if (typeof PNotify !== "undefined") {
                new PNotify({
                    title: "Profile Loaded",
                    text: "Loaded configuration settings from '" + profileName + "'.",
                    type: "info"
                });
            }
        };

        self.deleteProfile = function() {
            const name = self.selectedProfile();
            if (!name) return;
            
            const list = self.savedProfiles().filter(p => p.name !== name);
            self.savedProfiles(list);
            safeStorage.setItem("plotter_handwriting_profiles", JSON.stringify(list));
            self.selectedProfile("");
            
            if (typeof PNotify !== "undefined") {
                new PNotify({
                    title: "Profile Deleted",
                    text: "Deleted profile '" + name + "'.",
                    type: "notice"
                });
            }
        };

        // Initialize profiles
        self.loadSavedProfiles();

        self.selectedProfile.subscribe(function(newVal) {
            if (newVal) {
                self.applyProfile(newVal);
            }
        });

        // OctoPrint Lifecycle startup callback
        self.onStartup = function() {
            const el = document.getElementById("tab_plugin_plotterhandwriting");
            if (el) {
                self.setupDragging(el);
            }
        };
    }

    // Register viewmodel with OctoPrint
    OCTOPRINT_VIEWMODELS.push({
        construct: PlotterHandwritingViewModel,
        dependencies: ["settingsViewModel", "loginStateViewModel"],
        elements: ["#tab_plugin_plotterhandwriting"]
    });
});
