bodjo.on('connect', function (socket) {
	let level = 0;
	let timeout = bodjo.storage.get('timeout') || 500;
	let isPlaying = false;

	let onTick = null;

	let lastStatus = null;
	let lastTurn = null;
	let lastField = null;
	let expectedMessageId = 0;

	socket.on('field', (field, data, messageid) => {
		if (expectedMessageId == 0 || messageid == expectedMessageId) {
			level = data.level;
			lastStatus = data.status;
			bodjo.getControl('difficulty').set(level);
			
			lastField = decodeField(field);
			bodjo.callRender(lastField, lastTurn);

			if (lastStatus != 'playing')
				stop();

			if (isPlaying) {
				playStep();
			}
		}
	});

	function compile() {
		let code = bodjo.editor.getValue();
		try {
			onTick = new Function(code)();
		} catch (e) {
			bodjo.showError(e);
			return false;
		}
		if (typeof onTick !== 'function') {
			bodjo.showError('your code must return a function');
			return false;
		}
		return true;
	}
	function playStep() {
		if (typeof onTick !== 'function') {
			bodjo.showError('your code must return a function');
			stop();
			return;
		}

		let message;
		try {
			message = onTick(lastField);
		} catch (e) {
			bodjo.showError(e);
			stop();
			return;
		}
		
		if (typeof message !== 'object' ||
			message == null || Array.isArray(message) ||
			typeof message.action !== 'string' ||
			['open', 'mark'].indexOf(message.action) < 0 ||
			!Array.isArray(message.coordinates) ||
			message.coordinates.length != 2 ||
			!Number.isInteger(message.coordinates[0]) ||
			!Number.isInteger(message.coordinates[1]) ||
			message.coordinates[1] < 0 || message.coordinates[1] >= lastField.length ||
			message.coordinates[0] < 0 || message.coordinates[0] >= lastField[0].length) {
			bodjo.showError('function should return a valid message ({action: "open" or "mark", coordinates: [X, Y]})');
			stop();
			return;
		}

		lastTurn = message;
		setTimeout(function () {
			socket.emit('turn', message, ++expectedMessageId);
		}, timeout);
	}

	function stop() {
		isPlaying = false;
		bodjo.getControl('play').setActive(false);
	}
	function play() {
		if (!isPlaying) {
			if (!compile()) {
				console.log('compile error');
				stop();
				return;
			}

			if (lastStatus != 'playing') {
				setTimeout(function () {
					lastTurn = null;
					socket.emit('new', level, ++expectedMessageId);
				}, timeout);
			} else {
				playStep();
			}
		}

		isPlaying = true;
		bodjo.getControl('play').setActive(isPlaying);
	}

	bodjo.controls = [
		Button('play', play),
		Button('pause', stop),
		Button('replay', () => {
			lastTurn = null;
			socket.emit('new', level, ++expectedMessageId);
		}),
		Slider('timeout', 15, 1000, (_timeout) => {
			timeout = _timeout;
			bodjo.storage.set('timeout', timeout);
		}),
		Select('difficulty', [
			'Beginner (8x8, 10 bombs)',
			'Intermediate (16x16, 40 bombs)',
			'Expert (24x24, 99 bombs)',
			'Expert+ (48x48, 460 bombs)'
		], (_level) => {
			lastTurn = null;
			level = _level;
			socket.emit('new', level, ++expectedMessageId);
		})
	];

	bodjo.getControl('timeout').set(timeout);
});

bodjo.on('scoreboard', function (data) {
	bodjo.renderScoreboard(['Place', 'Player', 'Level completed'], data.map(playerdata => {
		return [
			playerdata.place + '.', 
			Player(playerdata.username), 
			(['—', 'Beginner', 'Intermediate', 'Expert', 'Expert+'])[playerdata.value+1]
		];
	}));
})

function decodeField(buffer) {
	let array = new Uint8Array(buffer);
	let width = array[0];
	let height = array[1];

	let field = new Array(height);
	for (let y = 0; y < height; ++y) {
		field[y] = new Array(width);
		for (let x = 0; x < width; ++x)
			field[y][x] = 0;
	}

	let cells = width * height;
	for (let i = 0; i < cells/2; i++) {
		let v = array[2 + i];

		let a = v >> 4;
		let b = v - a * 16;

		let i1 = i*2;
		let i2 = i*2+1;

		let x1 = i1 % width;
		let y1 = (i1 - x1) / width;
		let x2 = i2 % width;
		let y2 = (i2 - x2) / width;
		field[y1][x1] = " 0123456789F*x"[a];
		field[y2][x2] = " 0123456789F*x"[b];
	}

	return field;
}