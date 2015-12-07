var Twilio = Meteor.npmRequire('twilio');
var net = Meteor.npmRequire('net');
var PushBullet = Meteor.npmRequire('pushbullet');
var client = Twilio('ACa8b26113996868bf72b7fab2a8ea0361', '47d7dc0b6dc56c2161dc44bc0324bb70');
var last_pings = {'SF': (new Date()).getTime(), 'Caltrain': (new Date()).getTime()};
var MICRO_PHONE = {'SF': '+16502356065', 'Caltrain': '+16504417308'};
var WATCHDOG_TIMEOUT = 1800000;
var pusher = new PushBullet('oYHlSULc3i998hvbuVtsjlH0ps23l7y2');
var phone_action_map = {
  'lock':   '+15126435858',
  'unlock': '+15126435681',
  'bat':    '+15126435786',
  'stream_gps':    '+15128722240',
  'siren_1sec':    '+15126436369',
};

function log(s) {
  console.log('[' + new Date().toISOString() + '] ' + s);
}

Meteor.startup(function () {
    log('start up');
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
      log('err', err);
      log('res', res);
    });
};


var sendPushbullet = function(title, msg, phone_nickname, cb) {
    pusher.devices(function(err, res) {
        if (err) {
            return;
        }
        var params = {};
        if (phone_nickname && phone_nickname.length > 0) {
            var bikeId;
            for (var i = 0; i < res.devices.length; i++) {
                if (res.devices[i].nickname == phone_nickname) {
                    params = {device_iden: res.devices[i].iden};
                    break;
                }
            }
        }
        pusher.note(params, title, msg, cb);
    });
};

var sendRing = function(to_number, from_number) {
  log('send ring to', from_number);
    client.calls.create({
      to: to_number,
      from: from_number,
      url: "http://gps.chaselambda.com",
      timeout: 1,
      statusCallback: "http://gps.chaselambda.com/call_completed",
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["completed"],
    }, function (err, res) {
      log('err', err);
      log('res', res);
    });
};

var sendAlert = function(msg) {
  var CHASE_PHONE = '+15125778778';
  msg = 'Alert: ' + msg;
  sendPushbullet(msg, '', 'nexus4chase');
  sendPushbullet(msg, '', 'iphoneoliver');
  sendSMS(CHASE_PHONE, msg);
};

Meteor.methods({
    removeAll: function() {
      Coords.remove({from_arduino: true});
    },
    sendRing: function (action, micro_name) {
      var from_number = phone_action_map[action];
      StateMap.upsert({key: 'ringStatus', micro_name: micro_name}, {$set: {val: 'ringing'}});
      sendRing(MICRO_PHONE[micro_name], from_number);
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

var handle_micro_msg = function(msg) {
  var micro_name = 'SF';
  msg = msg.trim();
  log('handling', msg);
  if (msg.startsWith('gps:')) {
    parts = msg.split(':');
    var coord = {
      lat: parseInt(parts[1]) / 10000.0,
      long: parseInt(parts[2]) / 10000.0,
      createdAt: new Date(),
      type: 'gps',
      from_arduino: true
    };
    log('insert', coord);
    Coords.insert(coord);
  } else if (msg.startsWith('srt:')) {
    var locked = StateMap.findOne({key: 'locked', micro_name: micro_name});
    if (locked && locked.val) {
      sendAlert('arduino restarted in lock state!');
    }
    StateMap.upsert({key: 'locked', micro_name: micro_name}, {$set: {val: true}});
  } else if (msg.startsWith('bat:')) {
    var parts = msg.split('bat:');
    log(parts);
    parts = parts[1].split('/');
    log(parts);
    var voltage = parseInt(parts[0]);
    var percentage = parseInt(parts[1]);
    if (voltage < 3520 && percentage < 17) {
      sendAlert('undervoltage');
    }
  } else if (msg.startsWith('move_count:')) {
    sendAlert(msg);
  } else if (msg === "Locked") {
    StateMap.upsert({key: 'locked', micro_name: micro_name}, {$set: {val: true}});
  } else if (msg === "Unlocked") {
    StateMap.upsert({key: 'locked', micro_name: micro_name}, {$set: {val: false}});
  } else if (msg === "second_move") {
  }
  StateMap.upsert({key: 'lastSMS', micro_name: micro_name}, {$set: {val: msg}});
  log('update last_pings[' + key + ']');
  last_pings[micro_name] = (new Date()).getTime();
   
  if (msg === 'stream_gps') {
    StateMap.upsert({key: 'stream_gps', micro_name: micro_name}, {$set: {val: true}});
  } else {
    StateMap.upsert({key: 'stream_gps', micro_name: micro_name}, {$set: {val: false}});
  }
};

Router.route('/sms', {where: 'server'})
  .post(function () {
      handle_micro_msg(this.request.body.Body);
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call', {where: 'server'})
  .post(function () {
      log('hit call');
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end('<Response></Response>');
  });

Router.route('/call_completed', {where: 'server'})
  .post(function () {
      log('call completed');
      StateMap.upsert({key: 'ringStatus', micro_name: micro_name}, {$set: {val: 'completed'}});
      var headers = {'Content-type': 'text/xml'};
      this.response.writeHead(200, headers);
      this.response.end();
  });

Meteor.setInterval(function() {
    Object.keys(last_pings).forEach(function (micro_name) {
      var locked = StateMap.findOne({key: 'locked', micro_name: micro_name});
      if (!locked || !locked.val) {
        return;
      }
      if (last_pings[key] + WATCHDOG_TIMEOUT < (new Date()).getTime()) {
        log('watchdog too old for', key + ':', last_pings[key], (new Date()).getTime());
        sendAlert('watchdog expired!');
        StateMap.update(locked._id, {$set: {val: false}});
      } else {
        log('interval', (new Date()).getTime() - last_pings[key]);
      }
    });
}, 2000);

net.createServer( Meteor.bindEnvironment( function ( socket ) {
  socket.on("error", function(err) {
    log("Caught tcp error: ");
    log(err.stack);
    socket.destroy();
  });

  socket.addListener( "data", Meteor.bindEnvironment( function ( data ) {
        handle_micro_msg(data.toString('ascii'));
  }));
})).listen( 5000 );
