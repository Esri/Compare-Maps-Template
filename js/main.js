/*global define,document */
/*jslint sloppy:true,nomen:true */
/*
 | Copyright 2014 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define(["dojo/_base/declare", "dojo/_base/Color", "dojo/_base/kernel", "dojo/parser", "dojo/has", "dojo/query", "dijit/registry", "dojo/window", "dojo/promise/all", "dojo/_base/lang", "esri/arcgis/utils", "dojo/dom", "dojo/dom-attr", "dojo/dom-construct", "dojo/dom-style", "dojo/dom-class", "dojo/on", "esri/dijit/Legend", "esri/layers/FeatureLayer", "esri/dijit/Search", "esri/tasks/locator", "dojo/_base/array", "esri/dijit/HomeButton", "esri/lang", "dijit/layout/ContentPane", "application/SearchSources", "dojox/layout/ExpandoPane", "dojo/domReady!"], function(
  declare, Color, kernel, parser, has, query, registry, win, all, lang, arcgisUtils, dom, domAttr, domConstruct, domStyle, domClass, on, Legend, FeatureLayer, Search, Locator, array, HomeButton, esriLang, ContentPane, SearchSources, ExpandoPane) {
  return declare(null, {
    config: {},
    mapInfo: [],
    handler: null,
    startup: function(config) {
      document.documentElement.lang = kernel.locale;
      parser.parse();
      if (config) {
        this.config = config;

        // Create and add custom style sheet
        if (this.config.customstyle) {
          var style = document.createElement("style");
          style.appendChild(document.createTextNode(this.config.customstyle));
          document.head.appendChild(style);
        }

        //set title and default app text if defined
        if (this.config.title) {
          document.title = this.config.title;
        }
        if (this.config.showTitleAndDescription) {
          var content = esriLang.substitute(this.config, "<div class='header_info'>${description}</div>");

          var pane = new ExpandoPane({
            "region": "left",
            "class": "bg",
            "title": this.config.title,
            "content": content
          });
          pane.startup();
          var bc = registry.byId("bc");
          bc.addChild(pane);

          query(".dojoxExpandoIcon").on("click", function() {
            pane.toggle();
          });
          query(".dojoxExpandoTitle").on("click", function() {
            pane.toggle();
          });
          if (!this.config.openPanelOnLoad) {
            pane.toggle();
          }
        }

        this._createGrid();

      } else {
        var error = new Error("Main:: Config is not defined");
        this.reportError(error);
      }
      on(window, "resize", lang.hitch(this, this._resizeMap));
    },
    reportError: function(error) {
      // remove loading class from body
      domClass.remove(document.body, "app-loading");
      domClass.add(document.body, "app-error");

      var node = dom.byId("loading_message");
      if (node) {
        if (this.config && this.config.i18n) {
          node.innerHTML = this.config.i18n.map.error + ": " + error.message;
        } else {
          node.innerHTML = "Unable to create map: " + error.message;
        }
      }
    },
    _createGrid: function() {
      var row = null,
        promiseList = [],
        cell = null;

      for (var i = 0; i < this.config.webmaps.length; i++) {

        if (this.config.webmaps.length == 1) {
          //if only one map fill up the page
          row = this._createRow();
          cell = this._createCell(2, 2, row, i);
        } else if (this.config.webmaps.length % 3 === 0) {
          //multiples of three  so show in rows of three
          if (i % 3 === 0) { //create a new row for all even values
            row = this._createRow();
          }
          //Create a cell for each map and size to fit the number of rows
          cell = this._createCell(1, 3, row, i);

        } else {
          //not a multiple of three so let's just show in rows of two
          if (i % 2 === 0) { //create a new row for all even values
            row = this._createRow();
          }
          cell = this._createCell(1, 2, row, i);
        }



        var def = arcgisUtils.createMap(this.config.webmaps[i], cell.id, {
          usePopupManager: true,
          layerMixins: this.config.layerMixins || [],
          editable: this.config.editable,
          bingMapsKey: this.config.bingKey
        });
        promiseList.push(def);
      }


      all(promiseList).then(lang.hitch(this, function(results) {
        for (i = 0; i < results.length; i++) {
          if (results[i] && results[i].map) {
            var result = results[i];
            this.mapInfo.push(result);

            //specify the popup theme
            domClass.add(result.map.infoWindow.domNode, "light");

            //Enable the home extent button if configured
            if (this.config.home) {
              var id = "#map_" + i + " .esriSimpleSliderIncrementButton";
              var home = new HomeButton({
                map: result.map
              }, domConstruct.create("div", {}, query(id)[0], "after"));
              home.startup();
            }

            //add a title to the map area
            var map_title = domConstruct.create("div", {
              "class": "mapTitle bg fg",
              innerHTML: "<div class='title'>" + result.itemInfo.item.title + "</div>"
            }, result.map.id + "_root");

            var map_info = domConstruct.create("div", {
              "id": "_" + result.map.id,
              "title": this.config.i18n.tools.info.tooltip,
              "class": "mapInfo fg icon-info"
            }, map_title);

            result.itemInfo.item.legendId = "legend_" + result.map.id;
            this._createInfoContent(result.itemInfo.item, result);

            on(map_info, "click", lang.hitch(this, function(item) {
              if (item.target && item.target.id) {
                var panel_id = "panel" + item.target.id;
                var panel = dom.byId(panel_id);
                if (panel) {
                  domClass.toggle(panel, "hidden");
                }
              }
            }));


            //Create a sync button for each map
            //when clicked it will sync other maps to that extent.
            //if only one map don't enable
            if (results && results.length > 1) {
              if (this.config.sync) {
                var container = domConstruct.create("div", {
                  "class": "icon-sync-container"
                }, result.map.id + "_root");

                domConstruct.create("div", {
                  "id": "sync_" + i,
                  "class": "icon-sync",
                  "title": this.config.i18n.tools.sync.tooltip,
                  "click": lang.hitch(this, this._syncMaps, result.map)
                }, container);
              }


            }

            //Add the search button if enabled
            if (this.config.search) {

              var searchContainer = domConstruct.create("div", {
                "class": "search-container"
              }, result.map.id + "_root");

              var searchSources = new SearchSources({
                map: result.map,
                useMapExtent: this.config.searchExtent,
                geocoders: this.config.helperServices.geocode || [],
                itemData: result.itemInfo.itemData
              });
              var createdOptions = searchSources.createOptions();
              createdOptions.enableButtonMode = true;

              var search = new Search(createdOptions, searchContainer);
              domClass.add(search.domNode, "search-container");
              search.startup();
            }

          }
        }

        //Auto sync maps if configured to do so
        if (this.config.auto_sync) {
          query("#sync_0").some(lang.hitch(this, function(node) {
            node.click();
            return true;
          }));
        }
        //update theme
        this._updateTheme();
        //remove after all maps have loaded.
        domClass.remove(document.body, "app-loading");

      }));

    },
    _createCell: function(count, cols, row, i) {
      //Create a cell for each map and size to fit the number of rows
      var cell = domConstruct.create("div", {
        "class": "col span_" + count + "_of_" + cols + " shadow",
        "id": "map_" + i,
        "style": "height: " + win.getBox().h / Math.ceil(this.config.webmaps.length / cols) + "px;"
      }, row);
      return cell;
    },
    _createRow: function() {
      var row = domConstruct.create("div", {
        "class": "section group",
      }, "container");
      return row;
    },
    _syncMaps: function(extent_map, evt) {
      if (this.handler) {
        this.handler.remove();
      }

      //remove selected class from all icons then add to current one
      var sel = domClass.contains(evt.target, "icon-selected");
      query(".icon-sync").forEach(function(node) {
        domClass.remove(node, "icon-selected");
      });

      if (!sel) { //Toggle the selection capability
        domClass.add(evt.target, "icon-selected");
      } else {
        if (this.handler) {
          this.handler.remove();
        }
        return;
      }

      for (var i = 0; i < this.mapInfo.length; i++) {
        var map = this.mapInfo[i].map;
        if (map.id !== extent_map.id) {
          map.setExtent(extent_map.extent);
        }
      }
      this.handler = on(extent_map, "extent-change", lang.hitch(this, function() {
        for (var i = 0; i < this.mapInfo.length; i++) {
          var map = this.mapInfo[i].map;
          if (map.id !== extent_map.id) {
            map.setExtent(extent_map.extent);
          }
        }

      }));
    },
    setColor: function(value) {
      var colorValue = null;
      var rgb = Color.fromHex(value).toRgb();

      if (has("ie") == 8) {
        colorValue = value;
      } else {
        rgb.push(0.9);
        colorValue = Color.fromArray(rgb);
      }
      return colorValue;

    },
    _updateTheme: function() {
      if (this.config.sharedThemeConfig && this.config.sharedThemeConfig.attributes && this.config.sharedThemeConfig.attributes.theme) {
        var sharedTheme = this.config.sharedThemeConfig.attributes;
        this.config.theme_color = sharedTheme.theme.text.color;
        this.config.theme_bg_color = sharedTheme.theme.body.bg;
      }

      var bgcolor = this.setColor(this.config.theme_bg_color);
      var color = this.setColor(this.config.theme_color);


      query(".bg").style("backgroundColor", bgcolor.toString());
      query(".fg").style("color", color.toString()); //icon color
      query(".dojoxExpandoIcon").style("color", color.toString()); //hamburger menu
      query(".dojoxExpandoTitleNode").style("color", color.toString()); //title
    },
    _createInfoContent: function(details, layer) {

      //don't create if we don't have a legend or details
      var legendLayers = arcgisUtils.getLegendLayers(layer);
      if (legendLayers.length === 0 && details.description === null) {
        return;
      }

      var template = "<div class='panel_title'>${title}</div><div class='panel_desc'>${description}</div><div id=${legendId}></div>";
      var content = esriLang.substitute(details, template);

      domConstruct.create("div", {
        "id": "panel_" + layer.map.id,
        "class": "article hidden mapInfoPanel",
        innerHTML: content
      }, layer.map.id + "_root");

      //create the legend
      var legDiv = registry.byId(details.legendId);
      if (legDiv) {
        legDiv.destroy();
      }

      if (legendLayers && legendLayers.length > 0) {
        var legend = new Legend({
          map: layer.map,
          layerInfos: arcgisUtils.getLegendLayers(layer)
        }, layer.itemInfo.item.legendId);
        legend.startup();

      }

    },
    _resizeMap: function() {
      if (this.mapInfo && this.mapInfo.length === 0) {
        return;
      }
      var mapHFactor = (this.config.webmaps.length % 3 === 0) ? 3 : 2;
      for (var i = 0; i < this.mapInfo.length; i++) {
        var map = this.mapInfo[i].map;
        domStyle.set(map.id, {
          height: win.getBox().h / Math.ceil(this.config.webmaps.length / mapHFactor) + "px"
        });
        map.resize();
        map.reposition();
      }
      registry.byId("bc").resize();
    }
  });
});
