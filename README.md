# 🖋️ OctoPrint-PlotterHandwriting

[![OctoPrint Plugin](https://img.shields.io/badge/OctoPrint-Plugin-emerald.svg)](https://octoprint.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Gemini AI Powered](https://img.shields.io/badge/Gemini%20AI-Powered-blueviolet.svg)](https://deepmind.google/technologies/gemini)
[![Demo: Graph Plotting](https://img.shields.io/badge/Demo-Graph%20Plotting-blue.svg)](#-watch-the-machine-plot-live)

An advanced, high-precision OctoPrint plugin and standalone web workbench to generate organic, human-looking handwriting G-code for 3D printers, pen plotters, and drawing machines. 

## Equipped with a **3/4-Point Rigid Transformation calibration engine**, a **centerline tracing font skeletonizer**, a **buttery smooth canvas editor**, and a **Gemini AI Layout Optimizer**, this utility turns standard G-code plotters into expert human scribes.

<details>
<summary><b>🎬 Click here to view the animated Plotter Handwriting Demonstration!</b></summary>

<img src="./plotter_demonstration.gif" width="100%" alt="Plotter Handwriting Demonstration" />

</details>

---

## 📈 Graph Update: Real-World Diagram & Schematic Plotting

We have introduced a major **Graph & Diagram Plotting Update** that turns standard 3D printers and pen plotters into high-precision scientific illustrators. You can now effortlessly plot textbook figures, circuit diagrams, engineering schematics, mathematical graphs, and handwritten notes together on the same sheet!

### 🎬 Watch the Machine Plot Live

See the 3D printer pen carriage physically drawing a complex scientific diagram with continuous, silent strokes:

<div align="center">
  <img src="./graph_demonstration.gif" alt="Physical Pen Plotter Drawing a Scientific Diagram" width="380" style="border-radius: 12px; box-shadow: 0 6px 24px rgba(0,0,0,0.35);" />
  <p><em><b>Live Plotter Demonstration: Automated Continuous Toolpath Drawing</b></em></p>
</div>

<br />

### 📊 What's New in the Graph Update

![Graph & Diagram Plotting Update: What's New](graph_update_infographic.jpg)

1. **✨ Crisp Contour & Text Tracing (Up to 1600px)**:
   - Preserves high-resolution letterforms, sub-millimeter annotations, subscript numbers, and punctuation.
   - Accurately traces closed inner loops (like the counters in `e`, `o`, `B`, and `P`) without hollow distortion or letter merging.

2. **🔄 360° Freeform Rotation & 15° Snapping**:
   - Interactive on-canvas rotation handle allows freehand 360° rotation around the diagram's physical center.
   - Hold **Shift** while dragging to snap to clean 15° increments (0°, 15°, 30°, 45°, 90°, etc.).
   - Quick one-click rotation buttons (`↶ -90°`, `↷ +90°`, and `Reset 0°`) plus fine-tune continuous slider.

3. **📐 Proportional Aspect-Ratio Drag & Boundary Clamping**:
   - 8-point interactive bounding box handles for intuitive mouse resizing directly on the printbed.
   - Built-in bed margin boundary clamping prevents diagrams from ever extending past physical printer travel limits.

4. **👁️ Translucent Underlay Preview (Move & Resize Mode)**:
   - Renders a semi-transparent ghost underlay of the original bitmap directly beneath vector toolpaths on the canvas.
   - Allows instant visual alignment against notebook ruling lines or pre-existing paper margins before sending G-code.

5. **⚡ Continuous Toolpath Stitching (45%+ Efficiency Boost)**:
   - Intelligent bidirectional polyline stitching connects adjacent contour segments into uninterrupted strokes.
   - Reduces pen lifts by up to **80%**, saving plotting time and eliminating repetitive solenoid/servo noise.

6. **🖨️ Direct G-Code Engine Integration**:
   - Automatically translates rotated and scaled millimeter coordinates into physical plotter G-code.
   - Fully compatible with 3/4-Point Rigid Transformation calibration, thick book elevated beds, and real-time baby-stepping.

```mermaid
graph LR
    A["Raw Diagram / Image"] -->|1600px Upscale| B["Binarization & Filter"]
    B -->|Bidirectional Tracing| C["Crisp Contour Extraction"]
    C -->|Smart Stitching| D["Continuous Smooth Toolpaths"]
    D -->|360° Rotation & Scale| E["Bed Coordinate Mapping"]
    E -->|M106 / Z-Safe Lift| F["Physical Pen Plotter G-Code"]
```

---

## 🗺️ System Architecture & Data Flow

Below is the visual infographic outlining the complete compiler data pipeline and the 3D printer calibration alignment mechanism:

![Plotter Calibration Infographic](plotter_infographic.jpg)

```mermaid
graph TD
    A["Raw Text Input & User Prompts"] -->|Gemini AI| B["Gemini AI Layout Optimizer"]
    B -->|Optimize Layout| C["Vector Glyph Translation Engine"]
    C -->|Procedural Alternates| D["Jitter & Humanization Pipeline"]
    D -->|Humanize Path| E["Bilinear / Affine Translation Matrix"]
    E -->|Bilinear Warp| F["G-Code Compiler"]
    F -->|Slow Start| G["OctoPrint Serial Comm API"]
    G -->|Babystepping| H["Physical Pen Plotter Carriage"]
```

---

## 🌟 Key Features

### 1. 🪄 Gemini AI Layout Optimizer
* **Dynamic Content Fitting**: Automatically reads the layout spacing, checks the available physical bed capacity, and uses the Google Gemini API to rewrite, summarize, or expand your text to fit the lines.
* **Multi-Parameter Tuning**: Dynamically adjusts **Letter Height**, **Character Spacing**, and **Word Spacing** settings in tandem with editing text content to guarantee a pixel-perfect page layout.

### 2. 🎯 Interactive 3/4-Point Calibration
* **Skew & Rotation Auto-Correction**: Align paper at any angle! Simply jog your pen to the top-left (P1), top-right (P2), bottom-left (P3), and bottom-right (P4) corners of your paper margin. 
* **Real-time Error Validation**: Calculates the geometric difference between actual locked points and projected targets (parallelogram projection), displaying validation error rates in real time.
* **Canvas Tweaks**: Easily click and drag reference points on the canvas to visually fine-tune calibration coordinates.

### 3. 🌀 Humanization Jitter Engine

![Human Handwriting Simulation Infographic](humanization_infographic.jpg)

* **Procedural Alternates**: Randomly alternates glyph variants to ensure double letters (like 'oo' or 'll') look distinct.
* **Fluid Handwriting Jitters**: Simulates organic human hand tremor, letter slant jitter, baseline waviness/drift, and custom drag hooks when lifting/lowering the pen.

### 4. 🩻 Centerline Font Skeletonizer
* **Skeleton Mode**: Automatically collapses double-stroke closed-loop vector paths from standard TTF/OTF fonts into a single, clean centerline stroke, eliminating "bubble letter" hollow outlines.

### 5. 🐢 G-code Slow Start & Live Babystepping
* **Anti-Jitter Feedrate Control**: Tag and execute the first three words of a print job at **10% of standard feedrate** to prevent initial slippage.
* **Real-Time USB Jogging**: Adjust Y-axis offset (`M290 Y0.10`) and Z-offset height (`M290 Z0.02`) on the fly using our real-time micro-stepping adjustment panel.

### 6. 📐 FDM Bed Leveling & Screw Calculator

![FDM Bed Leveling Infographic](bed_leveling_infographic.jpg)

* **Thread Pitch Calibration**: Calculates your printer's height change per 1° degree of rotation based on user measurements.
* **Rotational Adjustment Guides**: Takes 4-corner mesh height deviation readings (FL, FR, BL, BR) and computes the exact rotational angle and direction (Clockwise vs. Counter-Clockwise) needed for each leveling screw.
* **Top-Down Visual Dials**: A vector dial gauge overlay renders target angles and arrows dynamically, with a green checkmark indicating when a corner is leveled (error < 0.015mm).

### 7. 📸 Diagram & Schematic Vector Block
* **Scientific & Technical Figure Plotting**: Upload any textbook diagram, apparatus figure, engineering drawing, or math plot directly into the workspace alongside your handwritten text.
* **Interactive Canvas Control**: Move, drag-resize from 8 bounding box handles, and freely rotate 360° (with 15° Shift-snapping and ±90° buttons) directly on the physical bed grid.
* **Crisp Contour & Text Engine**: High-resolution 1600px bidirectional contour extraction traces tiny text labels and inner character loops with razor sharpness.
* **Continuous Toolpaths**: Intelligent polyline stitching connects contours into continuous strokes, cutting pen lifts by up to 80% for silent and rapid plotting.
* **Live Underlay Alignment**: Semi-transparent ghost underlay shows the original image beneath vector lines on the canvas to guarantee perfect alignment before printing.

---

## 📦 Installation & Setup

### Manual Installation
Clone this repository and install the Python package directly into your OctoPrint virtual environment:

```bash
cd OctoPrint-PlotterHandwriting
pip install .
```

### Standalone Web Workbench (Recommended)
You can run the full interactive workspace, layout designer, G-code generator, and calibration wizard directly inside your browser as a standalone tool:

1. Locate the [test_ui.html](test_ui.html) file in this directory.
2. Open it directly in Google Chrome, Safari, or Firefox:
   ```bash
   open test_ui.html
   ```
3. Enter your **OctoPrint API URL** and **API Key** in the connection panel to jog, calibrate, and print directly from the browser!

## 🔬 Interactive Quiz: Can you spot the Machine?

Look at the handwritten notebook page below. Several paragraphs are plotted by a 3D printer running our handwriting synthesis engine, and one paragraph was physically written by a human. 

Can you identify which section is the real human handwriting?

<img src="comparison_sheet.jpg" width="100%" alt="Handwriting Comparison Quiz Sheet" />

<details>
<summary><b>🔍 Click here to reveal the answer!</b></summary>

### 🎯 The Reveal: Machine vs. Human

Here is the breakdown showing the machine-plotted handwriting (cyan) vs. the human reference (red):

<img src="handwriting_comparison.svg" width="100%" alt="Plotter vs Human Handwriting Comparison Revealed" />

* **🤖 Plotter Synthesis Output (Cyan)**: The top paragraphs (Questions, Spacers, Chairs, etc.) are written by a 3D printer running this plugin.
* **✍️ Human Reference (Red)**: The final paragraph under "Dowels" was physically written by the user themselves as a baseline comparison.

### Behind the Scenes: The Engineering

To mimic the user's actual hand style so closely that it blends seamlessly with the plotter's outputs, several layers of handwriting synthesis are combined:

1. **Jitter & Path Tremor Simulation**: High-frequency micro-variations (simulating muscle tremors) are procedural-noised onto the pen travel vectors, removing mathematical perfection from the strokes.
2. **Dynamic Slant and Baseline Drift**: Gradual baseline wave calculations and slight character rotation jitter emulate human fatigue and organic misalignment over a multi-paragraph page.
3. **Procedural Alternates Engine**: Dynamically shifts glyph variants on adjacent letters (e.g. comparing the double 'o' in "spacers" and "blocks") to avoid mechanical uniformity.
4. **Centerline Skeleton Mode**: Transforms hollow font outlines into single-line ink strokes that match a ballpoint or gel pen.

</details>

---

## 🧭 Step-by-Step Calibration & Printing Guide

![Beginner's Step-by-Step Setup Guide](beginner_guide_infographic.jpg)

Follow these steps for alignment on standard notebook ruled paper:

### Step 1: Secure and Align
Tape your ruled notebook page to the printbed. It doesn't have to be perfectly straight; our calibration engine handles skew up to 30°.

### Step 2: Establish Bed Points (Shift + Click)
Ensure **Live Calibration** is checked in Step 7 (which locks the manual calibration wizard to prevent coordinate conflicts).
1. **Point 1 (Top-Left)**: Hover over the canvas to see the red crosshair guides. Shift-click the intersection of your top red margin line and left vertical line to lock P1.
2. **Point 2 (Top-Right)**: The top margin guide line will track your cursor. Shift-click the top margin line on the right side of the page to lock P2.
3. **Point 3 (Bottom-Left)**: The 20 notebook ruled grid lines and left vertical margin will preview dynamically. Shift-click the intersection of the 20th horizontal line and left vertical margin to lock P3.
4. **Point 4 (Bottom-Right)**: The projected target circle for P4 appears in pink. Shift-click the 20th horizontal line on the right side to lock P4.
5. Inspect the **Calibration Accuracy** badge in the top-right. An error $< 1.5\text{ mm}$ is ideal.

### Step 3: AI-Optimize Layout
In Step 1, type your instruction (e.g. *"Fit text to lines"*), select a Gemini model (like **Gemini 2.5 Flash**), and click **Edit Text with AI**. The system automatically scales character heights and optimizes the spacing to fill the sheet perfectly.

### Step 4: Dry Run Verification
Click **Dry Run Verification (Servo Check)**. This generates G-code that travels the boundary margins with the pen lifted to visually verify alignment on the paper before drawing.

### Step 5: Upload & Real-time Tune
Click **Upload & Print**. During the initial slow-start phase, use the real-time tuning panel to micro-adjust offsets if the pen does not land perfectly on the paper lines:
* Use `▲` / `▼` to jog the Y-axis shift.
* Use `Pen Up` / `Pen Down` to jog Z-height.

---

## 🛠️ Configuration & Sliders

| Parameter | Recommended Value | Description |
| :--- | :--- | :--- |
| **Letter Height** | `3.5 - 5.5 mm` | Vertical scale of characters. |
| **Letter Vertical Offset** | `1.2 mm` | Adjusts how high above/below the notebook lines letters sit. Use `▲`/`▼` for 0.1mm micro-steps. |
| **Baseline Drift** | `0.05 - 0.15 mm` | Simulates slow vertical wave-like drift of lines. |
| **Wobble Strength** | `0.05 - 0.10 mm` | Simulates micro-tremors in hand grip. |
| **Slant Jitter** | `1.0° - 3.0°` | Adds minor slanting variation to individual characters. |

---

## 🛡️ License

Distributed under the MIT License. See [LICENSE](LICENSE) for more information.
