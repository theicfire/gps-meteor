var curMarker;
var globalMap;
var KEYS = {DOWN: 40, UP: 38};

Template.Map.events({
    'submit .markerCounter': function(event) {
        event.preventDefault();
        Session.set('coordNum', parseInt(event.target.children[0].value));
        return false;
    },
    'keydown .markerCounter': function(event) {
        var curVal = parseInt(event.target.value);
        // TODO keep this in a session variable..
        if (event.which == KEYS.DOWN) {
            event.preventDefault();
            if (Session.get('coordNum') > 0) {
                Session.set('coordNum', Session.get('coordNum') - 1);
            }
        } else if (event.which == KEYS.UP) {
            event.preventDefault();
            if (Session.get('coordNum') + 1 < Coords.find().count()) {
                Session.set('coordNum', Session.get('coordNum') + 1);
            }
        }
    }
});

Template.Map.rendered = function() {
    this.autorun(function() {
        if (curMarker) {
            curMarker.setMap(null);
        }
        var coord = Coords.findOne({}, {'sort': ['createdAt'], limit: 1, skip: Session.get('coordNum')});
        if (typeof google !== 'undefined' && globalMap) {
            curMarker = new google.maps.Marker({
                position: new google.maps.LatLng(coord.lat, coord.long),
                map: globalMap.instance
            });
        }
    });
};

Template.Map.helpers({
    coords: function() {
        return Coords.find();
    },
    count: function() {
        return Coords.find().count();
    },
    coordNum: function() {
        return Session.get('coordNum');
    }
});



Router.route('/', function () {
  // render the Home template with a custom data context
  this.render('Map');
});


//var doneFirst = false;
//Template.Map.created = function () {
    //var margin = {top: 20, right: 20, bottom: 30, left: 50},
        //width = 960 - margin.left - margin.right,
        //height = 500 - margin.top - margin.bottom;
    //var x = d3.time.scale()
        //.range([0, width]);

    //var y = d3.scale.linear()
        //.range([height, 0]);

    //var xAxis = d3.svg.axis()
        //.scale(x)
        //.orient("bottom");

    //var yAxis = d3.svg.axis()
        //.scale(y)
        //.orient("left");

    //var lineHits = d3.svg.line()
        //.x(function(d) { return x(d.createdAt); })
        //.y(function (d, i) { return y(i)});

    //if (!doneFirst) {
        //doneFirst = true;
        //var svg = d3.select("body").append("svg")
            //.attr("width", width + margin.left + margin.right)
            //.attr("height", height + margin.top + margin.bottom)
          //.append("g")
            //.attr("transform", "translate(" + margin.left + "," + margin.top + ")");
    //}

    //Tracker.autorun(function () {
        ////var data = Accels.find({createdAt: {$gt: new Date(new Date().getTime() - 1000 * 120)}});
        //var rows = Coords.find({createdAt: { $lt: new Date(2015, 2, 5, 22, 45), $gt: new Date(2015, 2, 5, 22, 30)}});
        //var data = rows.map(function(d) {
                //return {createdAt: new Date(d.createdAt).getTime()};
            //});
        //console.log(data);

        //var maxY = data.length;
        //var minY = 0;

        //var extent = d3.extent(data, function(d) { return d.createdAt; });
        //console.log('extent', extent);
        //x.domain(extent);
        //y.domain([minY, maxY]);

        //var svg = d3.select('svg g');
        //svg.html('');
        //svg.append("g")
          //.attr("class", "x axis")
          //.attr("transform", "translate(0," + height + ")")
          //.call(xAxis);

        //svg.append("g")
          //.attr("class", "y axis")
          //.call(yAxis)
        //.append("text")
          //.attr("transform", "rotate(-90)")
          //.attr("y", 6)
          //.attr("dy", ".71em")
          //.style("text-anchor", "end")
          //.text("Price ($)");

        //svg.append("path")
          //.datum(data)
          //.attr("class", "lineX")
          //.attr("d", lineHits);
    //});
//}





// Map stuff
Meteor.startup(function() {
GoogleMaps.load();
});

Template.body.helpers({
exampleMapOptions: function() {
  // Make sure the maps API has loaded
  if (GoogleMaps.loaded()) {
    // Map initialization options
    return {
      center: new google.maps.LatLng(-37.8136, 144.9631),
      zoom: 1
    };
  }
}
});

Template.body.created = function() {
// We can use the `ready` callback to interact with the map API once the map is ready.
GoogleMaps.ready('exampleMap', function(map) {
    globalMap = map;
    Session.set('coordNum', 0);
});
};
