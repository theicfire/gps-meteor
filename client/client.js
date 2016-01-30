Meteor.subscribe('state');

var has_phone = function() {
  return Globals.boxes[this.toString()].hasOwnProperty('phone_id');
};

Template.ArduinoListing.events({
    'click .reset': function(event) {
      event.preventDefault();
      Meteor.call('removeAll');
    }
});

Template.ArduinoListing.helpers({
  coords: function() {
    return Coords.find({from_arduino: true});
  },
  box_names: function() {
    return Object.keys(Globals.boxes).map(function (box_name) {return {name: box_name};});
  },
});

Template.Buttons.events({
    'click .sms-button': function(event) {
      console.log('send', event.target.innerHTML);
      Meteor.call('sendRing', event.target.innerHTML, this.toString());
    },
    'click .gcm-button': function(event) {
      console.log('send', event.target.innerHTML);
      Meteor.call('sendAndroidMessage', event.target.innerHTML, this.toString());
    },
    'click .phone-watchdog-button': function(event) {
      Meteor.call('togglePhoneWatchdog', this.toString());
    },
});

Template.Buttons.helpers({
  has_phone: has_phone,
});

Template.State.helpers({
  lock: function() {
    var locked = StateMap.findOne({key: 'locked', box_name: this.toString()});
    return locked && locked.val ? 'ON' : 'OFF';
  },
  stream_gps: function() {
    var stream_gps = StateMap.findOne({key: 'stream_gps', box_name: this.toString()});
    return stream_gps && stream_gps.val ? 'ON' : 'OFF';
  },
  lastState: function() {
    var lastState = StateMap.findOne({key: 'lastState', box_name: this.toString()});
    return lastState ? lastState.val : 'None';
  },
  cameraOn: function () {
    var cameraOn = StateMap.findOne({key: 'cameraOn', box_name: this.toString()});
    return cameraOn && cameraOn.val ? 'ON' : 'OFF';
  },
  phoneWatchdogOn: function () {
    var on = StateMap.findOne({key: 'phone_watchdog_on', box_name: this.toString()});
    return on && on.val ? 'ON' : 'OFF';
  },
  cameraBat: function () {
    var bat = StateMap.findOne({key: 'bat', box_name: this.toString()});
    return bat ? bat.val : 'None';
  },
  ringStatus: function() {
    var ringStatus = StateMap.findOne({key: 'ringStatus', box_name: this.toString()});
    return ringStatus ? ringStatus.val : 'None';
  },
  frame_count: function() {
    var frame_count = StateMap.findOne({key: 'frame_count', box_name: 'Caltrain'});
    if (frame_count) {
      return frame_count.val;
    }
    return 'None';
  },
  has_phone: has_phone,
});

Router.route('/', function () {
  // render the Home template with a custom data context
  this.render('ArduinoListing');
});
