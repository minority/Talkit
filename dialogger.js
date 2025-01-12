function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [, ""])[1].replace(/\+/g, '%20')) || null
}

function onError(e) {
    console.log('Error', e);
}

var fs = null;
var loadOnStart = getURLParameter('load');
var importOnStart = getURLParameter('import');

addEventListener('app-ready', function(e)
{
	fs = require('fs');
	$('#import').hide();
	$('#export').hide();
	$('#export-game').hide();
});

var graph = new joint.dia.Graph();

var defaultLink = new joint.dia.Link(
{
	attrs:
	{
		'.marker-target': { d: 'M 10 0 L 0 5 L 10 10 z', },
		'.link-tools .tool-remove circle, .marker-vertex': { r: 8 },
	},
});


defaultLink.set('smooth', true);

var avatarSelectHtml = '<p>Avatar: <select name="avatar">' +
	'<option>Idle</option>' +
	'<option>Smile</option>' +
	'<option>Angry</option>' +
	'<option>Confusion</option>' +
	'<option>Sadness</option>' +
	'<option>Diffidence</option>' +
	'</select><p>';

var variableTypeHtml = '<p>Type: <select name="variableType">' +
	'<option>bool</option>' +
	'<option>int</option>' +
	'<option>string</option>' +
	'</select><p>';	

var allowableConnections =
[
	['dialogue.Text', 'dialogue.Text'],
	['dialogue.Text', 'dialogue.Node'],
	['dialogue.Text', 'dialogue.Choice'],
	['dialogue.Text', 'dialogue.Set'],
	['dialogue.Text', 'dialogue.Branch'],
	['dialogue.Text', 'dialogue.System'],
	['dialogue.Text', 'dialogue.Image'],
	['dialogue.Text', 'dialogue.Action'],
	['dialogue.Action', 'dialogue.Action'],
	['dialogue.Action', 'dialogue.Text'],
	['dialogue.Action', 'dialogue.Node'],
	['dialogue.Action', 'dialogue.Choice'],
	['dialogue.Action', 'dialogue.Set'],
	['dialogue.Action', 'dialogue.Branch'],
	['dialogue.Action', 'dialogue.System'],
	['dialogue.Action', 'dialogue.Image'],
	['dialogue.System', 'dialogue.System'],
	['dialogue.System', 'dialogue.Text'],
	['dialogue.System', 'dialogue.Node'],
	['dialogue.System', 'dialogue.Choice'],
	['dialogue.System', 'dialogue.Set'],
	['dialogue.System', 'dialogue.Branch'],
	['dialogue.System', 'dialogue.Image'],
	['dialogue.System', 'dialogue.Action'],
	['dialogue.Image', 'dialogue.Image'],
	['dialogue.Image', 'dialogue.Text'],
	['dialogue.Image', 'dialogue.Node'],
	['dialogue.Image', 'dialogue.Choice'],
	['dialogue.Image', 'dialogue.Set'],
	['dialogue.Image', 'dialogue.Branch'],
	['dialogue.Image', 'dialogue.System'],
	['dialogue.Image', 'dialogue.Action'],
	['dialogue.Node', 'dialogue.Text'],
	['dialogue.Node', 'dialogue.Node'],
	['dialogue.Node', 'dialogue.Choice'],
	['dialogue.Node', 'dialogue.Set'],
	['dialogue.Node', 'dialogue.Branch'],
	['dialogue.Node', 'dialogue.System'],
	['dialogue.Node', 'dialogue.Image'],
	['dialogue.Node', 'dialogue.Action'],
	['dialogue.Choice', 'dialogue.Choice'],
	['dialogue.Choice', 'dialogue.Text'],
	['dialogue.Choice', 'dialogue.Node'],
	['dialogue.Choice', 'dialogue.Set'],
	['dialogue.Choice', 'dialogue.Branch'],
	['dialogue.Choice', 'dialogue.System'],
	['dialogue.Choice', 'dialogue.Image'],
	['dialogue.Choice', 'dialogue.Action'],
	['dialogue.Set', 'dialogue.Set'],
	['dialogue.Set', 'dialogue.Text'],
	['dialogue.Set', 'dialogue.Node'],
	['dialogue.Set', 'dialogue.Set'],
	['dialogue.Set', 'dialogue.Branch'],
	['dialogue.Set', 'dialogue.System'],
	['dialogue.Set', 'dialogue.Image'],
	['dialogue.Set', 'dialogue.Action'],
	['dialogue.Branch', 'dialogue.Text'],
	['dialogue.Branch', 'dialogue.Node'],
	['dialogue.Branch', 'dialogue.Set'],
	['dialogue.Branch', 'dialogue.Branch'],
	['dialogue.Branch', 'dialogue.System'],
	['dialogue.Branch', 'dialogue.Image'],
	['dialogue.Branch', 'dialogue.Action'],
];

function validateConnection(cellViewS, magnetS, cellViewT, magnetT, end, linkView)
{
	// Prevent loop linking
	if (magnetS == magnetT)
		return false;

	if (cellViewS == cellViewT)
		return false;
	
	// Can't connect to an output port
	if (magnetT.attributes.magnet.nodeValue !== 'passive') 
		return false;

	var sourceType = cellViewS.model.attributes.type;
	var targetType = cellViewT.model.attributes.type;
	var valid = false;
	for (var i = 0; i < allowableConnections.length; i++)
	{
		var rule = allowableConnections[i];
		if (sourceType == rule[0] && targetType == rule[1])
		{
			valid = true;
			break;
		}
	}
	if (!valid)
		return false;

	return true;
}

function validateMagnet(cellView, magnet)
{
	if (magnet.getAttribute('magnet') === 'passive')
		return false;

	// If unlimited connections attribute is null, we can only ever connect to one object
	// If it is not null, it is an array of type strings which are allowed to have unlimited connections
	var unlimitedConnections = magnet.getAttribute('unlimitedConnections');
	var links = graph.getConnectedLinks(cellView.model);
	for (var i = 0; i < links.length; i++)
	{
		var link = links[i];
		if (link.attributes.source.id === cellView.model.id && link.attributes.source.port === magnet.attributes.port.nodeValue)
		{
			// This port already has a connection
			if (unlimitedConnections && link.attributes.target.id)
			{
				var targetCell = graph.getCell(link.attributes.target.id);
				if (unlimitedConnections.indexOf(targetCell.attributes.type) !== -1)
					// It's okay because this target type has unlimited connections
					return true; 
			} 
			return false;
		}
	}

	return true;
}

joint.shapes.dialogue = {};

joint.shapes.dialogue.Base = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Base',
			size: { width: 250, height: 205 },
			name: '',
			avatar: 'Idle',
			delay: 0,
			attrs:
			{
				rect: { stroke: 'none', 'fill-opacity': 0 },
				text: { display: 'none' },
				'.inPorts circle': { magnet: 'passive' },
				'.outPorts circle': { magnet: true, },
			},
		},
		joint.shapes.devs.Model.prototype.defaults
	),
});
joint.shapes.dialogue.BaseView = joint.shapes.devs.ModelView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
        '<input type="actor" class="actor" placeholder="Actor" />',
		avatarSelectHtml,
        '<p> <textarea type="text" class="name" rows="4" cols="27" placeholder="Speech"></textarea></p>',
		'<p>Delay: <input type="delay" class="delay" placeholder="Delay" /></p>',
        '</div>',
	].join(''),

	initialize: function()
	{
	  

		_.bindAll(this, 'updateBox');
		joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

		this.$box = $(_.template(this.template)());
		// Prevent paper from handling pointerdown.
		this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });

	    // Prevent paper from handling pointerdown.
		this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });

		// Prevent paper from handling pointerdown.
		this.$box.find('select').on('mousedown click', function (evt) { evt.stopPropagation(); });


		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.name').on('change', _.bind(function(evt)
		{
			this.model.set('name', $(evt.target).val());
		}, this));

	    // This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.actor').on('change', _.bind(function (evt) {
		    this.model.set('actor', $(evt.target).val());
		}, this));
		
		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.delay').on('change', _.bind(function (evt) {
			this.model.set('delay', $(evt.target).val());
		}, this));

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('select[name="avatar"]').on('change', _.bind(function (evt) {
			this.model.set('avatar', $(evt.target).val());
		}, this));


	    // This is an example of reacting on the input change and storing the input data in the cell model. TEXTAREA
		this.$box.find('textarea.name').on('change', _.bind(function (evt) {
		    this.model.set('name', $(evt.target).val());
		}, this));

		this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
		// Update the box position whenever the underlying model changes.
		this.model.on('change', this.updateBox, this);
		// Remove the box when the model gets removed from the graph.
		this.model.on('remove', this.removeBox, this);

		this.updateBox();
	},

	render: function()
	{
		joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
		this.paper.$el.prepend(this.$box);
		this.updateBox();
		return this;
	},

	updateBox: function()
	{
		// Set the position and dimension of the box so that it covers the JointJS element.
	    var bbox = this.model.getBBox();
       
		// Example of updating the HTML with a data stored in the cell model.
		var nameField = this.$box.find('input.name');
		if (!nameField.is(':focus'))
		    nameField.val(this.model.get('name'));

	    // Example of updating the HTML with a data stored in the cell model.
		var actorField = this.$box.find('input.actor');
		if (!actorField.is(':focus'))
		    actorField.val(this.model.get('actor'));

		// Example of updating the HTML with a data stored in the cell model.
		var delayField = this.$box.find('input.delay');
		if (!delayField.is(':focus'))
			delayField.val(this.model.get('delay'));

	    // Example of updating the HTML with a data stored in the cell model.
		var textAreaField = this.$box.find('textarea.name');
		if (!textAreaField.is(':focus'))
		    textAreaField.val(this.model.get('name'));
		
		// Example of updating the HTML with a data stored in the cell model.
		var avatarField = this.$box.find('select[name="avatar"]');
		if (!avatarField.is(':focus'))
			avatarField.val(this.model.get('avatar'));

		var label = this.$box.find('.label');
		var type = this.model.get('type').slice('dialogue.'.length);
		label.text(type);
		label.attr('class', 'label ' + type);
		this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
	},

	removeBox: function(evt)
	{
		this.$box.remove();
	},
});

joint.shapes.dialogue.Choice = joint.shapes.devs.Model.extend(
	{
		defaults: joint.util.deepSupplement
		(
			{
				size: { width: 250, height: 225 },
				type: 'dialogue.Choice',
				inPorts: ['input'],
				outPorts: ['output'],
				actor: '',
				title: '',
				name: '',
				avatar: 'Idle',
				delay: 0,
				attrs:
					{

						'.outPorts circle': { unlimitedConnections: ['dialogue.Action'], }
					},
			},
			joint.shapes.dialogue.Base.prototype.defaults
		),
	});
joint.shapes.dialogue.ChoiceView = joint.shapes.dialogue.ChoiceView;

joint.shapes.dialogue.ChoiceView = joint.shapes.devs.ModelView.extend(
{
    template:
	[
		'<div class="node choice-node">',
		'<span class="label"> </span>',
		'<button class="delete">x</button>',
        '<input type="choice" class="title" placeholder="Title" />',
		avatarSelectHtml,
		'<p>Actor: <input type="actor" class="actor" placeholder="Actor" /></p>',
        '<p> <textarea type="text" class="name" rows="4" cols="27" placeholder="Speech"></textarea></p>',
		'<p>Delay: <input type="delay" class="delay" placeholder="Delay" /></p>',
		'</div>',
        		
	].join(''),

    initialize: function () {


        _.bindAll(this, 'updateBox');
        joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

        this.$box = $(_.template(this.template)());
        // Prevent paper from handling pointerdown.
        this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });
        this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });
        this.$box.find('idd').on('mousedown click', function (evt) { evt.stopPropagation(); });
		// Prevent paper from handling pointerdown.
		this.$box.find('select').on('mousedown click', function (evt) { evt.stopPropagation(); });

        // This is an example of reacting on the input change and storing the input data in the cell model.
        this.$box.find('textarea.name').on('change', _.bind(function (evt) {
            this.model.set('name', $(evt.target).val());
        }, this));

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.delay').on('change', _.bind(function (evt) {
			this.model.set('delay', $(evt.target).val());
		}, this));

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('input.actor').on('change', _.bind(function (evt) {
			this.model.set('actor', $(evt.target).val());
		}, this));

        // This is an example of reacting on the input change and storing the input data in the cell model.
        this.$box.find('input.title').on('change', _.bind(function (evt) {
            this.model.set('title', $(evt.target).val());
        }, this));

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('select[name="avatar"]').on('change', _.bind(function (evt) {
			this.model.set('avatar', $(evt.target).val());
		}, this));

        this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
        // Update the box position whenever the underlying model changes.
        this.model.on('change', this.updateBox, this);
        // Remove the box when the model gets removed from the graph.
        this.model.on('remove', this.removeBox, this);

        this.updateBox();
    },

    render: function () {
        joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
        this.paper.$el.prepend(this.$box);
        this.updateBox();
        return this;
    },

    updateBox: function () {
        // Set the position and dimension of the box so that it covers the JointJS element.
        var bbox = this.model.getBBox();
        // Example of updating the HTML with a data stored in the cell model.
        var nameField = this.$box.find('textarea.name');
        if (!nameField.is(':focus'))
            nameField.val(this.model.get('name'));

        // Example of updating the HTML with a data stored in the cell model.
        var nameField = this.$box.find('input.title');
        if (!nameField.is(':focus'))
            nameField.val(this.model.get('title'));

		// Example of updating the HTML with a data stored in the cell model.
		var actorField = this.$box.find('input.actor');
		if (!actorField.is(':focus'))
			actorField.val(this.model.get('actor'));

		// Example of updating the HTML with a data stored in the cell model.
		var avatarField = this.$box.find('select[name="avatar"]');
		if (!avatarField.is(':focus'))
			avatarField.val(this.model.get('avatar'));

		// Example of updating the HTML with a data stored in the cell model.
		var delayField = this.$box.find('input.delay');
		if (!delayField.is(':focus'))
			delayField.val(this.model.get('delay'));
		
        var label = this.$box.find('.label');
        var type = this.model.get('type').slice('dialogue.'.length);
        label.text(type);
        label.attr('class', 'label ' + type);


        this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
    },

    removeBox: function (evt) {
        this.$box.remove();
    },
});

joint.shapes.dialogue.Action = joint.shapes.devs.Model.extend(
	{
		defaults: joint.util.deepSupplement
		(
			{
				size: { width: 250, height: 225 },
				type: 'dialogue.Action',
				inPorts: ['input'],
				outPorts: ['output'],
				actor: '',
				title: '',
				name: '',
				delay: 0,
				avatar: 'Idle',
				attrs:
					{

						'.outPorts circle': { unlimitedConnections: ['dialogue.Choice'], }
					},
			},
			joint.shapes.dialogue.Base.prototype.defaults
		),
	});
joint.shapes.dialogue.ActionView = joint.shapes.dialogue.ChoiceView;

joint.shapes.dialogue.ActionView = joint.shapes.devs.ModelView.extend(
	{
		template:
			[
				'<div class="node choice-node">',
				'<span class="label"> </span>',
				'<button class="delete">x</button>',
				'<input type="choice" class="title" placeholder="Title" />',
				avatarSelectHtml,
				'<p>Actor: <input type="actor" class="actor" placeholder="Actor" /></p>',
				'<p> <textarea type="text" class="name" rows="4" cols="27" placeholder="Speech"></textarea></p>',
				'<p>Delay: <input type="delay" class="delay" placeholder="Delay" /></p>',
				'</div>',

			].join(''),

		initialize: function () {


			_.bindAll(this, 'updateBox');
			joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

			this.$box = $(_.template(this.template)());
			// Prevent paper from handling pointerdown.
			this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });
			this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });
			this.$box.find('idd').on('mousedown click', function (evt) { evt.stopPropagation(); });
			// Prevent paper from handling pointerdown.
			this.$box.find('select').on('mousedown click', function (evt) { evt.stopPropagation(); });

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('textarea.name').on('change', _.bind(function (evt) {
				this.model.set('name', $(evt.target).val());
			}, this));

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('input.delay').on('change', _.bind(function (evt) {
				this.model.set('delay', $(evt.target).val());
			}, this));

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('input.actor').on('change', _.bind(function (evt) {
				this.model.set('actor', $(evt.target).val());
			}, this));

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('input.title').on('change', _.bind(function (evt) {
				this.model.set('title', $(evt.target).val());
			}, this));

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('select[name="avatar"]').on('change', _.bind(function (evt) {
				this.model.set('avatar', $(evt.target).val());
			}, this));

			this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
			// Update the box position whenever the underlying model changes.
			this.model.on('change', this.updateBox, this);
			// Remove the box when the model gets removed from the graph.
			this.model.on('remove', this.removeBox, this);

			this.updateBox();
		},

		render: function () {
			joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
			this.paper.$el.prepend(this.$box);
			this.updateBox();
			return this;
		},

		updateBox: function () {
			// Set the position and dimension of the box so that it covers the JointJS element.
			var bbox = this.model.getBBox();
			// Example of updating the HTML with a data stored in the cell model.
			var nameField = this.$box.find('textarea.name');
			if (!nameField.is(':focus'))
				nameField.val(this.model.get('name'));

			// Example of updating the HTML with a data stored in the cell model.
			var nameField = this.$box.find('input.title');
			if (!nameField.is(':focus'))
				nameField.val(this.model.get('title'));

			// Example of updating the HTML with a data stored in the cell model.
			var actorField = this.$box.find('input.actor');
			if (!actorField.is(':focus'))
				actorField.val(this.model.get('actor'));

			// Example of updating the HTML with a data stored in the cell model.
			var avatarField = this.$box.find('select[name="avatar"]');
			if (!avatarField.is(':focus'))
				avatarField.val(this.model.get('avatar'));

			// Example of updating the HTML with a data stored in the cell model.
			var delayField = this.$box.find('input.delay');
			if (!delayField.is(':focus'))
				delayField.val(this.model.get('delay'));

			var label = this.$box.find('.label');
			var type = this.model.get('type').slice('dialogue.'.length);
			label.text(type);
			label.attr('class', 'label ' + type);


			this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
		},

		removeBox: function (evt) {
			this.$box.remove();
		},
	});

joint.shapes.dialogue.System = joint.shapes.devs.Model.extend(
	{
		defaults: joint.util.deepSupplement
		(
			{
				size: { width: 250, height: 155 },
				type: 'dialogue.System',
				inPorts: ['input'],
				outPorts: ['output'],
				name: '',
				delay: 0,
				attrs:
					{

						'.outPorts circle': { unlimitedConnections: ['dialogue.Choice', 'dialogue.Action'], }
					},
			},
			joint.shapes.dialogue.Base.prototype.defaults
		),
	});
joint.shapes.dialogue.SystemView = joint.shapes.dialogue.SystemView;

joint.shapes.dialogue.SystemView = joint.shapes.devs.ModelView.extend(
	{
		template:
			[
				'<div class="node">',
				'<span class="label"> </span>',
				'<button class="delete">x</button>',
				'<p> <textarea type="text" class="name" rows="4" cols="27" placeholder="Speech"></textarea></p>',
				'<p>Delay: <input type="delay" class="delay" placeholder="Delay" /></p>',
				'</div>',

			].join(''),

		initialize: function () {


			_.bindAll(this, 'updateBox');
			joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

			this.$box = $(_.template(this.template)());
			// Prevent paper from handling pointerdown.
			this.$box.find('textarea').on('mousedown click', function (evt) { evt.stopPropagation(); });
			this.$box.find('idd').on('mousedown click', function (evt) { evt.stopPropagation(); });
			this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });
			
			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('textarea.name').on('change', _.bind(function (evt) {
				this.model.set('name', $(evt.target).val());
			}, this));

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('input.delay').on('change', _.bind(function (evt) {
				this.model.set('delay', $(evt.target).val());
			}, this));

			this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
			// Update the box position whenever the underlying model changes.
			this.model.on('change', this.updateBox, this);
			// Remove the box when the model gets removed from the graph.
			this.model.on('remove', this.removeBox, this);

			this.updateBox();
		},

		render: function () {
			joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
			this.paper.$el.prepend(this.$box);
			this.updateBox();
			return this;
		},

		updateBox: function () {
			// Set the position and dimension of the box so that it covers the JointJS element.
			var bbox = this.model.getBBox();
			// Example of updating the HTML with a data stored in the cell model.
			var nameField = this.$box.find('textarea.name');
			if (!nameField.is(':focus'))
				nameField.val(this.model.get('name'));

			// Example of updating the HTML with a data stored in the cell model.
			var delayField = this.$box.find('input.delay');
			if (!delayField.is(':focus'))
				delayField.val(this.model.get('delay'));

			var label = this.$box.find('.label');
			var type = this.model.get('type').slice('dialogue.'.length);
			label.text(type);
			label.attr('class', 'label ' + type);


			this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
		},

		removeBox: function (evt) {
			this.$box.remove();
		},
	});


joint.shapes.dialogue.Image = joint.shapes.devs.Model.extend(
	{
		defaults: joint.util.deepSupplement
		(
			{
				size: { width: 300, height: 80 },
				type: 'dialogue.Image',
				inPorts: ['input'],
				outPorts: ['output'],
				name: '',
				delay: 0,
				attrs:
					{

						'.outPorts circle': { unlimitedConnections: ['dialogue.Choice', 'dialogue.Action'], }
					},
			},
			joint.shapes.dialogue.Base.prototype.defaults
		),
	});
joint.shapes.dialogue.ImageView = joint.shapes.dialogue.ImageView;

joint.shapes.dialogue.ImageView = joint.shapes.devs.ModelView.extend(
	{
		template:
			[
				'<div class="node">',
				'<span class="label"> </span>',
				'<button class="delete">x</button>',
				'<input type="name" class="name" placeholder="Name" />',
				'<p>Delay: <input type="delay" class="delay" placeholder="Delay" /></p>',
				'</div>',

			].join(''),

		initialize: function () {


			_.bindAll(this, 'updateBox');
			joint.shapes.devs.ModelView.prototype.initialize.apply(this, arguments);

			this.$box = $(_.template(this.template)());
			// Prevent paper from handling pointerdown.
			this.$box.find('input').on('mousedown click', function (evt) { evt.stopPropagation(); });
			//this.$box.find('idd').on('mousedown click', function (evt) { evt.stopPropagation(); });

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('input.name').on('change', _.bind(function (evt) {
				this.model.set('name', $(evt.target).val());
			}, this));

			// This is an example of reacting on the input change and storing the input data in the cell model.
			this.$box.find('input.delay').on('change', _.bind(function (evt) {
				this.model.set('delay', $(evt.target).val());
			}, this));

			this.$box.find('.delete').on('click', _.bind(this.model.remove, this.model));
			// Update the box position whenever the underlying model changes.
			this.model.on('change', this.updateBox, this);
			// Remove the box when the model gets removed from the graph.
			this.model.on('remove', this.removeBox, this);

			this.updateBox();
		},

		render: function () {
			joint.shapes.devs.ModelView.prototype.render.apply(this, arguments);
			this.paper.$el.prepend(this.$box);
			this.updateBox();
			return this;
		},

		updateBox: function () {
			// Set the position and dimension of the box so that it covers the JointJS element.
			var bbox = this.model.getBBox();

			// Example of updating the HTML with a data stored in the cell model.
			var nameField = this.$box.find('input.name');
			if (!nameField.is(':focus'))
				nameField.val(this.model.get('name'));

			// Example of updating the HTML with a data stored in the cell model.
			var delayField = this.$box.find('input.delay');
			if (!delayField.is(':focus'))
				delayField.val(this.model.get('delay'));

			var label = this.$box.find('.label');
			var type = this.model.get('type').slice('dialogue.'.length);
			label.text(type);
			label.attr('class', 'label ' + type);

			this.$box.css({ width: bbox.width, height: bbox.height, left: bbox.x, top: bbox.y, transform: 'rotate(' + (this.model.get('angle') || 0) + 'deg)' });
		},

		removeBox: function (evt) {
			this.$box.remove();
		},
	});


joint.shapes.dialogue.Node = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Node',
			inPorts: ['input'],
			outPorts: ['output'],
			attrs:
			{
				'.outPorts circle': { unlimitedConnections: ['dialogue.Choice', 'dialogue.Action'], }
			},
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.NodeView = joint.shapes.dialogue.BaseView;

joint.shapes.dialogue.Text = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Text',
			inPorts: ['input'],
			outPorts: ['output'],
			actor: '',
			delay: 0,
			textarea: 'Start writing',
			attrs:
			{
			  
				'.outPorts circle': { unlimitedConnections: ['dialogue.Choice', 'dialogue.Action'], }
			},
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.TextView = joint.shapes.dialogue.BaseView;

joint.shapes.dialogue.Branch = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
			type: 'dialogue.Branch',
			variableType: "bool",
			size: { width: 200, height: 150, },
			inPorts: ['input'],
			outPorts: ['output0'],
			values: [],
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.BranchView = joint.shapes.dialogue.BaseView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		'<button class="add">+</button>',
		'<button class="remove">-</button>',
		variableTypeHtml,
		'<input type="text" class="name" placeholder="Variable" />',
		'<input type="text" value="Default" readonly/>',
		'</div>',
	].join(''),

	initialize: function()
	{
		joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);
		this.$box.find('.add').on('click', _.bind(this.addPort, this));
		this.$box.find('.remove').on('click', _.bind(this.removePort, this));
		// Prevent paper from handling pointerdown.
		this.$box.find('select').on('mousedown click', function (evt) { evt.stopPropagation(); });

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('select[name="variableType"]').on('change', _.bind(function (evt) {
			this.model.set('variableType', $(evt.target).val());
		}, this));
	},

	removePort: function()
	{
		if (this.model.get('outPorts').length > 1)
		{
			var outPorts = this.model.get('outPorts').slice(0);
			outPorts.pop();
			this.model.set('outPorts', outPorts);
			var values = this.model.get('values').slice(0);
			values.pop();
			this.model.set('values', values);
			this.updateSize();
		}
	},

	addPort: function()
	{
		var outPorts = this.model.get('outPorts').slice(0);
		outPorts.push('output' + outPorts.length.toString());
		this.model.set('outPorts', outPorts);
		var values = this.model.get('values').slice(0);
		values.push(null);
		this.model.set('values', values);
		this.updateSize();
	},

	updateBox: function()
	{
		joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
		var values = this.model.get('values');
		var valueFields = this.$box.find('input.value');

		// Add value fields if necessary
		for (var i = valueFields.length; i < values.length; i++)
		{
			// Prevent paper from handling pointerdown.
			var field = $('<input type="text" class="value" />');
			field.attr('placeholder', 'Value ' + (i + 1).toString());
			field.attr('index', i);
			this.$box.append(field);
			field.on('mousedown click', function(evt) { evt.stopPropagation(); });

			// This is an example of reacting on the input change and storing the input data in the cell model.
			field.on('change', _.bind(function(evt)
			{
				var values = this.model.get('values').slice(0);
				values[$(evt.target).attr('index')] = $(evt.target).val();
				this.model.set('values', values);
			}, this));
		}

		// Example of updating the HTML with a data stored in the cell model.
		var variableTypeField = this.$box.find('select[name="variableType"]');
		if (!variableTypeField.is(':focus'))
			variableTypeField.val(this.model.get('variableType'));

		// Remove value fields if necessary
		for (var i = values.length; i < valueFields.length; i++)
			$(valueFields[i]).remove();

		// Update value fields
		valueFields = this.$box.find('input.value');
		for (var i = 0; i < valueFields.length; i++)
		{
			var field = $(valueFields[i]);
			if (!field.is(':focus'))
				field.val(values[i]);
		}
	},

	updateSize: function()
	{
		var textField = this.$box.find('input.name');
		var height = textField.outerHeight(true);
		this.model.set('size', { width: 200, height: 150 + Math.max(0, (this.model.get('outPorts').length - 1) * height) });
	},
});


joint.shapes.dialogue.Set = joint.shapes.devs.Model.extend(
{
	defaults: joint.util.deepSupplement
	(
		{
		    type: 'dialogue.Set',
		    inPorts: ['input'],
		    outPorts: ['output'],
		    size: { width: 200, height: 150, },
		    value: '',
			variableType: "bool",
			attrs:
				{

					'.outPorts circle': { unlimitedConnections: ['dialogue.Choice', 'dialogue.Action'], }
				},
		},
		joint.shapes.dialogue.Base.prototype.defaults
	),
});
joint.shapes.dialogue.SetView = joint.shapes.dialogue.BaseView.extend(
{
	template:
	[
		'<div class="node">',
		'<span class="label"></span>',
		'<button class="delete">x</button>',
		variableTypeHtml,
		'<input type="text" class="name" placeholder="Variable" />',
		'<input type="text" class="value" placeholder="Value" />',
		'</div>',
	].join(''),

	initialize: function()
	{
		joint.shapes.dialogue.BaseView.prototype.initialize.apply(this, arguments);
		this.$box.find('input.value').on('change', _.bind(function(evt)
		{
			this.model.set('value', $(evt.target).val());
		}, this));

		// Prevent paper from handling pointerdown.
		this.$box.find('select').on('mousedown click', function (evt) { evt.stopPropagation(); });

		// This is an example of reacting on the input change and storing the input data in the cell model.
		this.$box.find('select[name="variableType"]').on('change', _.bind(function (evt) {
			this.model.set('variableType', $(evt.target).val());
		}, this));
	},

	updateBox: function()
	{
		joint.shapes.dialogue.BaseView.prototype.updateBox.apply(this, arguments);
		var field = this.$box.find('input.value');
		if (!field.is(':focus'))
			field.val(this.model.get('value'));

		// Example of updating the HTML with a data stored in the cell model.
		var variableTypeField = this.$box.find('select[name="variableType"]');
		if (!variableTypeField.is(':focus'))
			variableTypeField.val(this.model.get('variableType'));
	},
});

function gameData()
{
	var cells = graph.toJSON().cells;
	
	var nodesByID = {};
	var cellsByID = {};
	var nodes = [];
	for (var i = 0; i < cells.length; i++)
	{
		var cell = cells[i];
		if (cell.type !== 'link')
		{
			var node =
			{
				type: cell.type.slice('dialogue.'.length),
				id: cell.id,
				actor: cell.actor,
                title: cell.title,
				delay: cell.delay,
			};
			
			if (node.type === 'Branch')
			{
				node.variable = cell.name;
				node.variableType = cell.variableType;
				node.branches = {};
				node.branches.conditions = [];
			}
			
			else if (node.type === 'Set')
			{
				node.variable = cell.name;
				node.value = cell.value;
				node.next = null;
				node.variableType = cell.variableType;		                
			}

			else if (node.type === 'System') {
				node.name = cell.name;
				node.next = null;
			}

			else if (node.type === 'Image') {
				node.name = cell.name;
				node.next = null;
			}

			else if (node.type === 'Choice') {
				node.actor = cell.actor;
			    node.name = cell.name;
			    node.title = cell.title;
			    node.next = null;
				node.avatar = cell.avatar;
			}
			else if (node.type === 'Action') {
				node.actor = cell.actor;
				node.name = cell.name;
				node.title = cell.title;
				node.next = null;
				node.avatar = cell.avatar;
			}
			else
			{
			    node.actor = cell.actor;
				node.name = cell.name;
				node.avatar = cell.avatar;
				node.next = null;
			}
			nodes.push(node);
			nodesByID[cell.id] = node;
			cellsByID[cell.id] = cell;
		}
	}
	for (var i = 0; i < cells.length; i++)
	{
		var cell = cells[i];
		if (cell.type === 'link')
		{
			var source = nodesByID[cell.source.id];
			var target = cell.target ? nodesByID[cell.target.id] : null;
			if (source)
			{
				if (source.type === 'Branch')
				{
					var portNumber = parseInt(cell.source.port.slice('output'.length));
					var value;
					if (portNumber === 0)
						value = '_default';
					else
					{
						var sourceCell = cellsByID[source.id];
						value = sourceCell.values[portNumber - 1];
					}

					source.branches.conditions.push({condition: value, destination: target ? target.id : null});
				}
				else if ((source.type === 'Text' || source.type === 'Node' || source.type === 'System' || source.type === 'Image' || source.type === 'Action' || source.type === 'Set' || source.type === 'Branch') && target && target.type === 'Choice')
				{
					if (!source.choices)
					{
						source.choices = [];
						delete source.next;
					}
					source.choices.push(target.id);
				}
				else if ((source.type === 'Text' || source.type === 'Node' || source.type === 'System' || source.type === 'Image' || source.type === 'Choice' || source.type === 'Set' || source.type === 'Branch') && target && target.type === 'Action' )
				{
					if (!source.choices)
					{
						source.choices = [];
						delete source.next;
					}
					source.choices.push(target.id);
				}
				
				else
					source.next = target ? target.id : null;
			}
		}
	}
	return nodes;
}


var filename = null;
var defaultFilename = 'dialogue.json';

function flash(text)
{
	var $flash = $('#flash');
	$flash.text(text);
	$flash.stop(true, true);
	$flash.show();
	$flash.css('opacity', 1.0);
	$flash.fadeOut({ duration: 1500 });
}

function offerDownload(name, data)
{
	var a = $('<a>');
	a.attr('download', name);
	a.attr('href', 'data:application/json,' + encodeURIComponent(JSON.stringify(data)));
	a.attr('target', '_blank');
	a.hide();
	$('body').append(a);
	a[0].click();
	a.remove();
}

function promptFilename(callback)
{
	if (fs)
	{
		filename = null;
		window.frame.openDialog(
		{
			type: 'save',
		}, function(err, files)
		{
			if (!err && files.length == 1)
			{
				filename = files[0];
				callback(filename);
			}
		});
	}
	else
	{
		filename = prompt('Filename', defaultFilename);
		callback(filename);
	}
}

function applyTextFields()
{
	$('input[type=text]').blur();
}

function save()
{
	applyTextFields();
	if (!filename) {
		promptFilename(doSave);
	}
	else 
	{
		doSave();
	}
}

function doSave()
{
	console.log(gameData());
	if (filename)
	{
		if (fs)
		{
			fs.writeFileSync(filename, JSON.stringify(graph), 'utf8');
			fs.writeFileSync(gameFilenameFromNormalFilename(filename), JSON.stringify(gameData()), 'utf8');
		}
		else
		{
			if (!localStorage[filename]) 
			{
				addFileEntry(filename);
			}
			localStorage[filename] = JSON.stringify(graph);
		}
		flash('Saved ' + filename);
	}
}

function load()
{
    if (fs) {
        window.frame.openDialog(
		{
		    type: 'open',
		    multiSelect: false,
		}, function (err, files) {
		    if (!err && files.length == 1) {
		        graph.clear();
		        filename = files[0];
		        graph.fromJSON(JSON.parse(fs.readFileSync(filename, 'utf8')));
		    }
		});
    }

    else {

        $('#menu').show();
    }
}

function exportFile()
{
	if (!fs)
	{
		applyTextFields();
		offerDownload(filename ? filename : defaultFilename, graph);
	}
}

function gameFilenameFromNormalFilename(f)
{
    return f.substring(0, f.length - 2) + 'on';
}

function exportGameFile()
{
	if (!fs)
	{
		applyTextFields();
		offerDownload(gameFilenameFromNormalFilename(filename ? filename : defaultFilename), gameData());
	}
}

function importFile()
{
	if (!fs)
		$('#file').click();
}

function add(constructor)
{
	return function()
	{
		var position = $('#cmroot').position();
		var container = $('#container')[0];
		var element = new constructor(
		{
			position: { x: position.left + container.scrollLeft, y: position.top + container.scrollTop },
		});
		graph.addCells([element]);
	};
}

function clear()
{
	graph.clear();
	filename = null;
}

var paper = new joint.dia.Paper(
{
	el: $('#paper'),
	width: 250000,
	height: 8000,
	model: graph,
	gridSize: 16,
	defaultLink: defaultLink,
	validateConnection: validateConnection,
	validateMagnet: validateMagnet,
	snapLinks: { radius: 75 }

});

var panning = false;
var mousePosition = { x: 0, y: 0 };
paper.on('blank:pointerdown', function(e, x, y)
{
	panning = true;
	mousePosition.x = e.pageX;
	mousePosition.y = e.pageY;
	$('body').css('cursor', 'move');
	applyTextFields();
});
paper.on('cell:pointerdown', function(e, x, y)
{
	applyTextFields();
});

$('#container').mousemove(function(e)
{
	if (panning)
	{
		var $this = $(this);
		$this.scrollLeft($this.scrollLeft() + mousePosition.x - e.pageX);
		$this.scrollTop($this.scrollTop() + mousePosition.y - e.pageY);
		mousePosition.x = e.pageX;
		mousePosition.y = e.pageY;
	}
});

$('#container').mouseup(function (e)
{
	panning = false;
	$('body').css('cursor', 'default');
});

function handleFiles(files)
{
	filename = files[0].name;
	var fileReader = new FileReader();
	fileReader.onload = function(e)
	{
		graph.clear();
		graph.fromJSON(JSON.parse(e.target.result));
	};
	fileReader.readAsText(files[0]);
}

$('#file').on('change', function()
{
	handleFiles(this.files);
});

$('body').on('dragenter', function(e)
{
	e.stopPropagation();
	e.preventDefault();
});

$('body').on('dragexit', function(e)
{
	e.stopPropagation();
	e.preventDefault();
});

$('body').on('dragover', function(e)
{
	e.stopPropagation();
	e.preventDefault();
});

$('body').on('drop', function(e)
{
	e.stopPropagation();
	e.preventDefault();
	handleFiles(e.originalEvent.dataTransfer.files);
});

$(window).on('keydown', function(event)
{
	// Catch Ctrl-S or key code 19 on Mac (Cmd-S)
	if (((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() == 's') || event.which == 19)
	{
		event.stopPropagation();
		event.preventDefault();
		save();
		return false;
	}
	else if ((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() == 'o')
	{
		event.stopPropagation();
		event.preventDefault();
		load();
		return false;
	}
	else if ((event.ctrlKey || event.metaKey) && String.fromCharCode(event.which).toLowerCase() == 'e')
	{
		event.stopPropagation();
		event.preventDefault();
		exportFile();
		return false;
	}
	return true;
});



$(window).resize(function()
{
	applyTextFields();
	var $window = $(window);
	var $container = $('#container');
		$container.height($window.innerHeight());
		$container.width($window.innerWidth());
		var $menu = $('#menu');
		$menu.css('top', Math.max(0, (($window.height() - $menu.outerHeight()) / 2)) + 'px');
		$menu.css('left', Math.max(0, (($window.width() - $menu.outerWidth()) / 2)) + 'px');
		return this;
});

function addFileEntry(name)
{
	var entry = $('<div>');
	entry.text(name);
	var deleteButton = $('<button class="delete">-</button>');
	entry.append(deleteButton);
	$('#menu').append(entry);

	deleteButton.on('click', function(event)
	{
		localStorage.removeItem(name);
		entry.remove();
		event.stopPropagation();
	});

	entry.on('click', function(event)
	{
		graph.clear();
		graph.fromJSON(JSON.parse(localStorage[name]));
		filename = name;
		$('#menu').hide();
	});
}

(function()
{
	for (var i = 0; i < localStorage.length; i++)
		addFileEntry(localStorage.key(i));
})();

$('#menu button.close').click(function()
{
	$('#menu').hide();
	panning = false;
});

$(window).trigger('resize');

$('#paper').contextmenu(
{
	width: 150,
	items:
	[
		{ text: 'Text', alias: '1-1', action: add(joint.shapes.dialogue.Text) },
		{ text: 'Choice', alias: '1-2', action: add(joint.shapes.dialogue.Choice) },
		{ text: 'Branch', alias: '1-3', action: add(joint.shapes.dialogue.Branch) },
		{ text: 'Set', alias: '1-4', action: add(joint.shapes.dialogue.Set) },
		{ text: 'Node', alias: '1-5', action: add(joint.shapes.dialogue.Node) },
		{ text: 'System', alias: '1-6', action: add(joint.shapes.dialogue.System) },
		{ text: 'Image', alias: '1-7', action: add(joint.shapes.dialogue.Image) },
		{ text: 'Action', alias: '1-8', action: add(joint.shapes.dialogue.Action) },
		{ type: 'splitLine' },
		{ text: 'Save', alias: '2-1', action: save },
		{ text: 'Load', alias: '2-2', action: load },
		{ text: 'Import', id: 'import', alias: '2-3', action: importFile },
		{ text: 'New', alias: '2-4', action: clear },
		{ text: 'Export', id: 'export', alias: '2-5', action: exportFile },
		{ text: 'Export game file', id: 'export-game', alias: '2-6', action: exportGameFile },
	]
});

///AUTOLOAD IF URL HAS ? WILDCARD
if (loadOnStart != null) {
    loadOnStart += '.json';
    console.log(loadOnStart);
    graph.clear();
    filename = loadOnStart;
    graph.fromJSON(JSON.parse(localStorage[loadOnStart]));
}
