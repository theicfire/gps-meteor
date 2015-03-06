Template.Map.helpers({
    coords: function() {
        return Coords.find();
    }
});

Template.Map.rendered = function () {
    console.log('map rendered');
};


Router.route('/', function () {
  // render the Home template with a custom data context
  this.render('Map');
});
