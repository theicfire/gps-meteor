Meteor.startup(function () {
    console.log('start up');
    if (Coords.find().count() === 0) {
        Coords.insert({lat: 37.446013, long: -122.125731, createdAt: (new Date()).getTime()})
    }
});

Meteor.publish('coords', function(num) {
    Counts.publish(this, 'countCoords', Coords.find(), { noReady: true });
    return Coords.find({}, {'sort': ['createdAt'], skip: num, limit: 1});
});

Meteor.publish('arduino_coords', function() {
    // TODO change
    return Coords.find({from_arduino: true}, {'sort': ['createdAt'], limit: 200});
});

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
    }
});

// IronRouter
Router.route('/add_coords/:lat/:long/:time', {where: 'server'})
  .post(function () {
      var coord = {
          lat: this.params.lat,
          long: this.params.long,
          createdAt: new Date(parseInt(this.params.time))
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });

Router.route('/add_arduino/:lat/:long/:time/:type', {where: 'server'})
  .post(function () {
      var year = this.params.time.substr(0, 4);
      var month = this.params.time.substr(4, 2);
      var day = this.params.time.substr(6, 2);
      var hour = this.params.time.substr(8, 2);
      var min = this.params.time.substr(10, 2);
      var sec = this.params.time.substr(12, 2);
      var coord = {
        lat: parseInt(this.params.lat) / 100000.0,
        long: parseInt(this.params.long) / 100000.0,
        createdAt: new Date(year, month, day, hour, min, sec),
        type: this.params.type,
        from_arduino: true
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });
