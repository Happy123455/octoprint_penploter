import octoprint.plugin

class PlotterHandwritingPlugin(
    octoprint.plugin.StartupPlugin,
    octoprint.plugin.TemplatePlugin,
    octoprint.plugin.AssetPlugin,
    octoprint.plugin.SettingsPlugin
):
    # SettingsPlugin Mixin
    def get_settings_defaults(self):
        return {
            "pen_up_gcode": "G0 Z5 F5000",
            "pen_down_gcode": "G1 Z0 F2000",
            "move_gcode": "G0 X{x} Y{y}",
            "draw_gcode": "G1 X{x} Y{y}",
            "start_gcode": "G21 ; Set units to mm\nG90 ; Absolute coordinates\nG28 ; Home X Y Z\nG0 Z5 F5000 ; Make sure pen is up",
            "end_gcode": "G0 Z10 F5000 ; Lift pen\nG28 X0 Y0 ; Move carriage out of the way\nM84 ; Disable motors",
            "feedrate_draw": 2000,
            "feedrate_travel": 4000,
            "default_font": "cursive",
            "font_size": 10,
            "line_spacing": 18,
            "margin_x": 10,
            "margin_y": 15,
            "paper_width": 210,
            "paper_height": 297,
            "bed_width": 220,
            "bed_height": 220,
            "page_alignment": "top-left",
            "snap_to_bed_grid": True,
            "use_detected_lines": False,
            "line_offset": 0.0,
            "line_detection_mode": "auto",
            "manual_line1_y": 50.0,
            "manual_line2_y": 68.0,
        }

    # AssetPlugin Mixin
    def get_assets(self):
        return {
            "js": ["js/hershey_fonts.js", "js/plotterhandwriting.js"],
            "css": ["css/plotterhandwriting.css"]
        }

    # TemplatePlugin Mixin
    def get_template_configs(self):
        return [
            # Injects the tab and configures it
            {"type": "tab", "name": "Pen Plotter", "template": "plotterhandwriting_tab.jinja2", "custom_bindings": True}
        ]

    # Software Update hook
    def get_update_information(self):
        return {
            "plotterhandwriting": {
                "displayName": "Plotter Handwriting",
                "displayVersion": self._plugin_version,
                "type": "github_commit",
                "user": "Happy123455",
                "repo": "OctoPrint-PlotterHandwriting",
                "current": self._plugin_version,
                "pip": "https://github.com/Happy123455/OctoPrint-PlotterHandwriting/archive/{target_version}.zip",
            }
        }

__plugin_name__ = "Plotter Handwriting"
__plugin_pythoncompat__ = ">=3.7,<4"

def __plugin_load__():
    global __plugin_implementation__
    __plugin_implementation__ = PlotterHandwritingPlugin()

    global __plugin_hooks__
    __plugin_hooks__ = {
        "octoprint.plugin.softwareupdate.keyorder": __plugin_implementation__.get_update_information
    }
