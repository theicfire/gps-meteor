var Twilio = Meteor.npmRequire('twilio');
var client = Twilio('ACa8b26113996868bf72b7fab2a8ea0361', '47d7dc0b6dc56c2161dc44bc0324bb70');
var last_ping;
var CHASE_PHONE = '+15125778778';
//var MICRO_PHONE = '+16502356065';
var MICRO_PHONE = '+16507720745';
var WATCHDOG_TIMEOUT = 250000;

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

var sendSMS = function(number, msg) {
    client.sendMessage({
      to: number,
      from: '+15128722240',
      body: msg
    }, function (err, res) {
      console.log('err', err);
      console.log('res', res);
    });
};

var sendRing = function(to_number, from_number) {
  console.log('send ring to', from_number);
    client.calls.create({
      to: to_number,
      from: from_number,
      url: "http://chasegps.meteor.com",
      timeout: 1,
      statusCallback: "http://chasegps.meteor.com/call_completed",
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
    }, function (err, res) {
      console.log('err', err);
      console.log('res', res);
    });
};

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
    },
    sendSMS: function (msg) {
      sendSMS(MICRO_PHONE, msg);
    },
    sendRing: function (from_number) {
      StateMap.upsert({key: 'ringStatus'}, {$set: {val: 'ringing'}});
      sendRing(MICRO_PHONE, from_number);
    },
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
        lat: parseInt(this.params.lat) / 10000.0,
        long: parseInt(this.params.long) / 10000.0,
        createdAt: new Date(),
        type: this.params.type,
        from_arduino: true
      };
      Coords.insert(coord);
      this.response.end('Received loc of ' + JSON.stringify(coord) + '\n');
  });

Router.route('/sms', {where: 'server'})
  .post(function () {
      var msg = this.request.body.Body;
      console.log(msg);
      if (msg.startsWith('gps:')) {
        parts = msg.split(':');
        var coord = {
          lat: parseInt(parts[1]) / 100000.0,
          long: parseInt(parts[2]) / 100000.0,
          createdAt: new Date(),
          type: 'gps',
          from_arduino: true
        };
        console.log('insert', coord);
        Coords.insert(coord);
      }
      StateMap.upsert({key: 'lastSMS'}, {$set: {val: msg}});
      last_ping = (new Date()).getTime();
      this.response.end('<Response></Response>');
  });

Router.route('/call', {where: 'server'})
  .post(function () {
      console.log('hit call');
      this.response.end('<Response></Response>');
  });

Router.route('/call_completed', {where: 'server'})
  .post(function () {
      console.log('call completed');
      StateMap.upsert({key: 'ringStatus'}, {$set: {val: 'completed'}});
      this.response.end();
  });

Meteor.setInterval(function() {
    var pingState = StateMap.findOne({key: 'pingState'});
    if (!pingState || !pingState.val) {
      return;
    }
    if (last_ping + WATCHDOG_TIMEOUT < (new Date()).getTime()) {
      sendSMS(CHASE_PHONE, 'Watchdog expired');
      StateMap.update(pingState._id, {$set: {val: false}});
    } else {
      console.log('interval', (new Date()).getTime() - last_ping);
    }
}, 2000);

//var sendMessage = Meteor.wrapAsync(client.sendMessage);

//var poll = function(sid) {
  //console.log('poll', sid);
    //client.getSms(sid, function(err, res) {
        //console.log('got response');
      //console.log(res);
      //setTimeout(function () {poll(sid)}, 1000);
    //});
//}

Meteor.setTimeout(function() {
      var send = 'some' + ((new Date()).getTime() % 1000 + 'thing');
      console.log('Sending', send);

      var res = sendMessage({
        to: '+15125778778',
        from: '+15128722240',
        body: send
      });
      console.log('res', Object.keys(res));
      poll(res.sid);
}, 1000);
