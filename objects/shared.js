/**

    EV Route Planner - A router planner for electric cars

    Copyright (C) 2014, 2015  Paul Churchley

    EV Route Planner is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    EV Route Planner is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.

    Full details of license can be found here: http://www.gnu.org/licenses/gpl-3.0.en.html

**/


/**
  * Options (set on Option Page).
  * 
  */ 
var model = 1,
    range = 75,
    distanceUnits,
    powerUse = 3.5,
    batterykWh=21,
    powerUnits,
    plugs,
    fastestShortest = 'fastest',
    SOCatEndofLeg = 25,
    SOCatEndofCharge = 80,
    minStopTime = 30,
    preferredNetworks,
    preferredLevel;

/**
  * Car Defaults.
  * 
  */

var Cars = [
    { car: 'Nissan Leaf Mk1', ID: 0, range: 65, powerUse: 3.5, plugs: [1, 2], batterykWh: 19 },
    { car: 'Nissan Leaf Mk2', ID: 1, range: 75, powerUse: 3.5, plugs: [1, 2], batterykWh: 21 },
    { car: 'Tesla Roadster', ID: 2, range: 180, powerUse: 3.5, plugs: [8], batterykWh: 50 },
    { car: 'Tesla Model S P60', ID: 3, range: 210, powerUse: 3.5, plugs: [25], batterykWh: 60 },
    { car: 'Tesla Model S P85', ID: 4, range: 300, powerUse: 3.5, plugs: [25], batterykWh: 85 },
    { car: 'Renault Zoe', ID: 5, range: 80, powerUse: 3.5, plugs: [25], batterykWh: 22 },
    { car: 'BMW i3', ID: 6, range: 75, powerUse: 3.5, plugs: [3, 25, 33], batterykWh: 22 }
];

var defaultCar = 1 // Leaf Mk2


var StopType = {
    START: 1,
    CHARGING: 100,
    NONCHARGING: 200,
    END: 999
};

var METERS_TO_MILES = 0.000621371192;

var tempStop;
var newIdx;


function OCM() {

    var OCMOptions;
    var OCMCenter;
    var OCMrange;
    var OCMlocale;
    var OCMjson;
    var OCMurl;
    var stations;

    var OCMBaseUrl = 'http://api.openchargemap.io/v2/poi/?output=json';


    var that = this;

    this.loadStations = function (Options) {

        this.OCMOptions = Options;
        this.OCMCenter = Options.center;
        this.OCMrange = Options.range;
        this.OCMlocale = Options.locale;
        this.OCMConnectionTypeID = Options.ConnectionTypeID;
        this.OCMjson = '';

        // build url
        this.OCMurl = OCMBaseUrl
                + '&latitude=' + this.OCMOptions.center.lat
                + '&longitude=' + this.OCMOptions.center.lng
                + '&distance=' + this.OCMOptions.range
                + '&verbose=' + this.OCMOptions.verbose
                + '&maxresults=1000';

        if (this.OCMConnectionTypeID) this.OCMurl += '&connectiontypeid=' + this.OCMConnectionTypeID

        //operatorid='Ecotricity'
        // connectiontype='' 1 - J1772, 2 - CHAdeMO, 4 - Commando, 8 - Tesla Roadster, 25 - Type 2, 27 - Tesla Supercharger, 32 - CCS J1772, 33 - CCS Type 2, 
        // chargepointid=''

        $.ajax({
            url: that.OCMurl,
            dataType: 'json',
            async: false,
            success: function (data) {
                if (!data.length) {
                    showAlert('No OCM Stations Returned - URL=' + that.OCMurl);
                    return -1;
                }
                that.OCMjson = data;
                return 0;
            },
            error: function () {
                showAlert('Error Getting OCM Stations - URL=' + that.OCMurl);
                return -1;
            }
        });

    }

    /**
     * Return all Stations as Station objects
     * 
     * If no stations then return null
     * If JSON not loaded then return -1 
     */
    this.getAllStations = function () {

        if (this.OCMjson != null) {
            return this.OCMjson;
        } else {
            showAlert('No Charging Stations Found');
            return -1;
        }

    }

    /**
     * Return all Stations as an array for specific level as Station objects
     * 
     * If no stations then return null
     * If JSON not loaded then return -1
     * 
     */
    this.getStationsByLevel = function (level) {

        if (this.OCMjson != null) {

            var selectedStations = [];

            for (var stationIdx in this.OCMjson) {
                for (connectionIdx in this.OCMjson[stationIdx].Connections) {
                            if (this.OCMjson[stationIdx].Connections[connectionIdx].LevelID == level) {
                                selectedStations.push(this.OCMjson[stationIdx]);
                            }
                }
            }

            return selectedStations;
        }

        showAlert('No Charging Stations Found for Your Cirteria : Level = ' + level);
        return -1;
    }

    /**
     * Return one Station as Station object
     * 
     * If not found then return -1
     */
    this.getStationByID = function (id) {

        if (this.OCMjson != null) {
            var station = getStationFromJSON(id, this.OCMjson);
            return station;
        } else {
            showAlert('Charging Station' + id + ' not found');
            return -1;
        }
    }

    // returns lat/long as a hash of the station 
    this.getStationLatlng = function (id) {
        var station = this.getStationByID(id);
        var Latlng = {
            lat: station.AddressInfo.Latitude,
            lng: station.AddressInfo.Longitude
        }
        return Latlng;
    }

}

// Route Object
// Tracks the route and its waypoints
//
// Markers are also stored when a Marker creates a Charging Waypoint


function Route() {

    this.startLocation;
    this.endLocation;
    this.stops = [];
    
    // takes Google.maps.LatLng object and creates a Stop object for the starting point
    this.setStart = function(startLatlng) {
        this.startLocation = new Stop(startLatlng, StopType.START, null, null, null);
    }

    // takes Google.maps.LatLng object and creates a Stop object for the ending point
    this.setEnd = function (endLatlng) {
        this.endLocation = new Stop(endLatlng, StopType.END, null, null, null);
    }

    // returns the start location (Stop Object)
    this.getStartLocation = function() {
        return this.startLocation;
    }

    // returns the end location (Stop Object)
    this.getEndLocation = function () {
        return this.endLocation;
    }

    // Takes LatLng obj 
    // Add non-charging waypoint object at beginning of charge stop chain
    this.addNonChargeStopToBeginning = function (LatLng) {

        var nonChargeStop = this.createNonChargingStop(LatLng);

        this.stops.unshift(nonChargeStop);

        // Get address from latlon and update the stop
        getFormattedAddressFromLatLng(LatLng, function (formatted_address) {
            this.stops[0].UpdateStationTitle(formatted_address);
        }.bind(this));

    }

    // Takes LatLng obj 
    // Add non-charging waypoint object at end of charge stop chain
    this.addNonChargeStopToEnd = function (LatLng) {

        var nonChargeStop = this.createNonChargingStop(LatLng);

        this.stops.push(nonChargeStop);

        // Get address from latlon and update the stop
        getFormattedAddressFromLatLng(LatLng, function (formatted_address) {
            this.stops[this.stops.length-1].UpdateStationTitle(formatted_address);
        }.bind(this));
    }


    // Takes LatLng obj and the id of the chargestop after which it should be added
    // Add non-charging waypoint object in middle of waypoint chain
    this.addNonChargeStopToMiddle = function (LatLng, afterStopIdx) {

        var nonChargeStop = this.createNonChargingStop(LatLng);
        newIdx = parseInt(afterStopIdx) + 1;

        this.stops.splice(newIdx, 0, nonChargeStop);

        getFormattedAddressFromLatLng(LatLng, function (formatted_address) {
            this.stops[newIdx].UpdateStationTitle(formatted_address);
        }.bind(this));

    }

    // Takes station id, its marker object and the OCM stations 
    // Add charging waypoint object at end of charge stop chain
    this.addChargeStopToBeginning = function (id, marker, myOCM) {

        chargeStop = this.createChargingStop(id, marker, myOCM);

        this.stops.unshift(chargeStop);
    }

    // Takes station id, its marker object and the OCM stations 
    // Add charging waypoint object at end of charge stop chain
    this.addChargeStopToEnd = function (id, marker, myOCM) {

        var chargingStop = this.createChargingStop(id, marker, myOCM);

        this.stops.push(chargingStop);
    }


    // Takes station id, its marker object and the OCM stations and the id of the chargestop after which it should be added
    // Add charging waypoint object in middle of waypoint chain
    this.addChargeStopToMiddle = function (id, marker, myOCM, afterStopIdx) {

        var chargeStop = this.createChargingStop(id, marker, myOCM);
        var newIdx = afterStopIdx++;

        this.stops.splice(afterStopIdx, 0, chargeStop);
    }

    // removes the stop at deleteStopIdx
    this.deleteStop = function (deleteStopIdx) {

        this.stops.splice(deleteStopIdx, 1);
    }

    // returns the stop array
    this.getAllStops = function () {

        return this.stops;
    }

    // return an array of Google Waypoint objects for every waypoint stop (i.e. not start/end)
    this.getAllStopLatlngs = function () {

        var stopLatlngs = [];

        for (var i = 0 ; i < this.stops.length ; i++) {
            var LL = new google.maps.LatLng(this.stops[i]['position'].lat, this.stops[i]['position'].lng);
            stopLatlngs.push({ location: LL });
        };

        return stopLatlngs;
    }

    // clears the stop array and reset the lastStopId
    this.clearStops = function () {
        this.stops.length = 0;
        lastStopId = 0;
    }

    // creates a Stop object as a charging stop
    this.createChargingStop = function (id, Marker, myOCM) {

        var Latlng = myOCM.getStationLatlng(id);
        var Station = getStationFromJSON(id, myOCM.OCMjson);
        var chargingStop = new Stop(Latlng, StopType.CHARGING, id, Station, Marker);

        return chargingStop;
    }

    // creates a Stop object as a non-charging stop
    this.createNonChargingStop = function (Latlng) {

        var nonChargingStop = new Stop(Latlng, StopType.NONCHARGING, null, null, null);

        return nonChargingStop;
    }


    // ****************************************************
    // Privately controls the Charge Stop id number allocation
    // ****************************************************
    function sortWaypointsBystopID(a, b) {
        return a.stopID-b.stopID;
    }
}

//  Stop Object
// Each stop has a generated stopID but this is not a sequence.
// Sequence is deteremined by the position in the stops array
function Stop(Latlng, type, id, Station, Marker) {

    var lastStopId = 0;
    this.stopId = getNextID();
    this.position = Latlng;
    this.type = type;
    this.id = id;           // can be null for non charging locations
    this.Station = Station; // can be null for non charging locations
    this.Marker = Marker;  

    this.chargeRequiredkWh = 0; // kWh needed after previous leg to come up to target SOC after charge
    this.chargingTimeRequired = 0 // time in mins to charge up the chargeRequiredkWh using hte type of charging at the stop

    if (Station) { this.stationTitle = Station.AddressInfo.Title }
    else { this.stationTitle = null };

    this.getStop = function() {
        var CS = {
            stopId: this.stopId,
            position: this.Latlng,
            type: this.StopType,
            id: this.stationID,
            Station: this.Station,
            Marker: this.Marker,
            stationTitle: this.stationTitle,
            chargeRequiredkWh: this.chargeRequiredkWh,
            chargingTimeRequired: this.chargingTimeRequired
        };

        return CS;
    }

    this.updateChargeRequiredkWh = function (kWh) {
        this.chargeRequiredkWh = kWh;
    }

    this.updateChargingTimeRequired = function (mins) {
        this.chargingTimeRequired = mins;
    }

    this.UpdateStationTitle = function (title) {
        this.stationTitle = title;
    }



    // ****************************************************
    // Privately controls the Charge Stop id number allocation
    // ****************************************************

    function getNextID() {
        lastStopId++;
        return lastStopId;
    }

}

function getOCMRefData() {

    // return immediate while testing
    // return;

    return $.ajax({
        url: 'http://api.openchargemap.io/v2/referencedata/',
        dataType: 'json',
        async: false,
        error: function () {
            showAlert('Error getting OCM Ref Data');
        }
    }).responseJSON;
}

function getStoredOptions() {

    model = amplify.store('EVZone.Planner.Model');
    if (model == '') model = defaultModel;

    range = amplify.store('EVZone.Planner.range');
    if (range == '') range = Cars[defaultModel].range;

    powerUse = amplify.store('EVZone.Planner.powerUse');
    if (powerUse == '') powerUse = Cars[defaultModel].powerUse;

    powerUnits = amplify.store('EVZone.Planner.powerUnits');

    plugs = amplify.store('EVZone.Planner.plugs');
    if (plugs == '') plugs = Cars[defaultModel].plugs;

    distanceUnits = amplify.store('EVZone.Planner.distanceUnits');
    fastestShortest = amplify.store('EVZone.Planner.fastestShortest');
    SOCatEndofLeg = amplify.store('EVZone.Planner.SOCatEndofLeg');
    SOCatEndofCharge = amplify.store('EVZone.Planner.SOCatEndofCharge');
    minStopTime = amplify.store('EVZone.Planner.minStopTime');
    preferredNetworks = amplify.store('EVZone.Planner.preferredNetworks');
    preferredLevel = amplify.store('EVZone.Planner.preferredLevel');

}

// **********************************
// Helper functions
// **********************************
function getStationFromJSON(id, json) {
    for (var stationIdx in json) {
        if (json[stationIdx].ID == id) {
            return json[stationIdx];
        }
    }
    return -1;
}

function leftPad(number, targetLength) {
    var output = number + '';
    while (output.length < targetLength) {
        output = '0' + output;
    }
    return output;
}