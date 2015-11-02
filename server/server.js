var Twilio = Meteor.npmRequire('twilio');
var client = Twilio('ACa8b26113996868bf72b7fab2a8ea0361', '47d7dc0b6dc56c2161dc44bc0324bb70');
var last_ping;

Meteor.startup(function () {
    console.log('start up');
    if (Coords.find().count() === 0) {
        Coords.insert({lat: 37.446013, long: -122.125731, createdAt: (new Date()).getTime()})
    }
    StateMap.find({key: 'pingState'}).observeChanges({
      added: function() {
        console.log('pingState added');
        last_ping = (new Date()).getTime();
      },
      changed: function() {
        console.log('pingState updated');
        last_ping = (new Date()).getTime();
      },
    });
});

Meteor.publish('coords', function(num) {
    Counts.publish(this, 'countCoords', Coords.find(), { noReady: true });
    return Coords.find({}, {'sort': ['createdAt'], skip: num, limit: 1});
});

Meteor.publish('arduino_coords', function() {
    // TODO change
    return Coords.find({from_arduino: true}, {'sort': {'createdAt': -1}, limit: 10});
});

Meteor.publish('state', function() {
  return StateMap.find({});
});

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
    },
    sendSMS: function(msg) {
      client.sendMessage({
        to:'+15125778778',
        from: '+15128722240',
        body: msg
      }, function (err, res) {
        console.log('err', err);
        console.log('res', res);
      });
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

Router.route('/add_arduino/:lat/:long/:type', {where: 'server'})
  .post(function () {
      var coord = {
        lat: parseInt(this.params.lat) / 100000.0,
        long: parseInt(this.params.long) / 100000.0,
        createdAt: new Date(),
        type: this.params.type,
        from_arduino: true
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });

Router.route('/sms', {where: 'server'})
  .post(function () {
      console.log(this.request.body);
      last_ping = (new Date()).getTime();
      this.response.end('<Response></Response>');
  });

Meteor.setInterval(function() {
    var pingState = StateMap.findOne({key: 'pingState'});
    if (!pingState || !pingState.val) {
      return;
    }
    if (last_ping + 4000 < (new Date()).getTime()) {
      console.log('not pinged!', pingState);
      StateMap.update(pingState._id, {$set: {val: false}});
    } else {
      console.log('interval', (new Date()).getTime() - last_ping);
    }
}, 2000);

/* Twilio message:
I20151102-09:40:01.401(-8)? { ToCountry: 'US',
I20151102-09:40:01.401(-8)?   ToState: 'TX',
I20151102-09:40:01.401(-8)?   SmsMessageSid: 'SM18e8600674582091d288cafb1f5e5f7d',
I20151102-09:40:01.401(-8)?   NumMedia: '0',
I20151102-09:40:01.401(-8)?   ToCity: 'Austin',
I20151102-09:40:01.401(-8)?   FromZip: '78705',
I20151102-09:40:01.401(-8)?   SmsSid: 'SM18e8600674582091d288cafb1f5e5f7d',
I20151102-09:40:01.401(-8)?   FromState: 'TX',
I20151102-09:40:01.401(-8)?   SmsStatus: 'received',
I20151102-09:40:01.401(-8)?   FromCity: 'AUSTIN',
I20151102-09:40:01.401(-8)?   Body: 'Hi twillio',
I20151102-09:40:01.401(-8)?   FromCountry: 'US',
I20151102-09:40:01.402(-8)?   To: '+15128722240',
I20151102-09:40:01.402(-8)?   ToZip: '',
I20151102-09:40:01.402(-8)?   NumSegments: '1',
I20151102-09:40:01.402(-8)?   MessageSid: 'SM18e8600674582091d288cafb1f5e5f7d',
I20151102-09:40:01.402(-8)?   AccountSid: 'ACa8b26113996868bf72b7fab2a8ea0361',
I20151102-09:40:01.402(-8)?   From: '+15125778778',
I20151102-09:40:01.402(-8)?   ApiVersion: '2010-04-01' }
*/
