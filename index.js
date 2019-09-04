const BodjoGame = require('@dkaraush/bodjo-game');
let bodjo = new BodjoGame(promptConfig('config.json'));
bodjo.initClient('./web/');

bodjo.on('player-connect', (player) => {
	if (typeof bodjo.scoreboard.get(player) === 'undefined')
		bodjo.scoreboard.push(player, -1);

	let data = {
		level: 0,
		field: null,
		open: clearField(0),
		status: 'playing'
	};

	player.emit('field', encodeField(data.open), {
		status: data.status, 
		level: data.level

	});

	player.on('new', (level, messageid) => {
		if (typeof level !== 'number' ||
			level < 0 || level >= LEVELS.length)
			level = 0;

		if (typeof messageid !== 'number')
			messageid = null;

		data = {
			level: level,
			field: null,
			open: clearField(level),
			status: 'playing'
		}

		player.emit('field', encodeField(data.open), {
			status: data.status, 
			level: data.level
		}, messageid);
	});

	player.on('turn', (message, messageid) => {
		if (typeof message !== 'object' ||
			message == null || Array.isArray(message) ||
			data.status != 'playing' ||
			typeof message.action !== 'string' ||
			['open', 'mark'].indexOf(message.action) < 0 ||
			!Array.isArray(message.coordinates) ||
			message.coordinates.length != 2 ||
			!Number.isInteger(message.coordinates[0]) ||
			!Number.isInteger(message.coordinates[1]) ||
			message.coordinates[1] < 0 || message.coordinates[1] >= data.open.length ||
			message.coordinates[0] < 0 || message.coordinates[0] >= data.open[0].length)
			return;

		if (typeof messageid !== 'number')
			messageid = null;

		if (data.field == null)
			data.field = newField(data.level, message);

		let result = doTurn(data, message);
		if (result != 'playing') {
			data.status = result;
			if (result == 'won') {
				if (bodjo.scoreboard.get(player) < data.level)
					bodjo.scoreboard.push(player, data.level);
			}
			if (result == 'defeat')
				data.open = data.field;

		}

		player.emit('field', encodeField(data.open), {
			status: data.status,
			level: data.level
		}, messageid);
	});
});

bodjo.start();

const LEVELS = [
	{ // beginner
		width: 8,
		height: 8,
		bombs: 10
	},
	{ // intermediate
		width: 16,
		height: 16,
		bombs: 40
	},
	{ // expert
		width: 24,
		height: 24,
		bombs: 99
	},
	{ // expert+
		width: 48,
		height: 48,
		bombs: 460
	}
];

function encodeField(field) {
	let height = field.length;
	let width = field[0].length;

	let cells = width*height;
	let byteCount = Math.ceil(cells / 2);
	let buffer = new Buffer(2 + (cells / 2));
	buffer.writeUInt8(width, 0);
	buffer.writeUInt8(height, 1);

	function value(i) {
		let s, x;
		try {
			s = field[(i-(x=i%width))/width][x];
		} catch (e) {return 0;}
		let v = " 0123456789F*x".indexOf(s)
		if (v >= 0)
			return v;
		return 0;
	}
	for (let i = 0; i < cells; i += 2)
		buffer.writeUInt8(value(i) * 16 + value(i+1), 2 + (i/2));
	return buffer;
}
function clearField(level) {
	return Array(LEVELS[level].height).fill().map(() => Array(LEVELS[level].width).fill(' '));
}
function newField(level, message) {
	let matrix = clearField(level);
	for (let b = 0; b < LEVELS[level].bombs; ++b) {
		let y = null, x = null;
		while (y == null || (
				matrix[y][x] == '*' || 
				(
					message.action == 'open' && 
					message.coordinates[0] == x &&
					message.coordinates[1] == y
				)
			)) {
			y = Math.round(Math.random() * (matrix.length-1));
			x = Math.round(Math.random() * (matrix[0].length-1));
		}

		matrix[y][x] = '*';
	}

	for (let y = 0; y < matrix.length; ++y) {
		for (let x = 0; x < matrix[y].length; ++x) {
			if (matrix[y][x] != '*')
				matrix[y][x] = around(matrix, x, y) + '';
		}
	}
	return matrix;
}
function around(matrix, x, y) {
	let value = 0;
	for (let X = x-1; X <= x+1; ++X) {
		for (let Y = y-1; Y <= y+1; ++Y) {
			if (X == x && Y == y)
				continue;
			if (X < 0 || Y < 0 || 
				Y >= matrix.length || X >= matrix[Y].length)
				continue;

			if (matrix[Y][X] == '*')
				value++;
		}
	}
	return value;
}
function doTurn(data, message) {
	let C = message.coordinates;
	let symbol = data.field[C[1]][C[0]];
	let openSymbol = data.open[C[1]][C[0]];
	
	if (message.action == 'mark') {
		if (openSymbol == 'F') {
			data.open[C[1]][C[0]] = ' ';
		} else if (openSymbol == ' ') {
			data.open[C[1]][C[0]] = 'F';
		}
		return data.status;
	}

	// message.action == 'open'
	if (openSymbol == 'F')
		return data.status;

	if (symbol == '*') {
		data.field[C[1]][C[0]] = 'x';
		return 'defeat';
	}

	if ("123456789".indexOf(symbol) >= 0) {
		data.open[C[1]][C[0]] = symbol;
		if (won(data))
			return 'won';
		return data.status;
	}

	if (symbol == '0') {
		let cells = [C];
		while (cells.length > 0) {
			let ncells = [];
			for (let cell of cells) {
				if (data.open[cell[1]][cell[0]] != ' ')
					continue;
				let s = data.field[cell[1]][cell[0]];
				data.open[cell[1]][cell[0]] = s;
				if (s == '0') {
					if (cell[0] > 0)
						ncells.push([cell[0]-1, cell[1]]);
					if (cell[1] > 0)
						ncells.push([cell[0], cell[1]-1]);
					if (cell[0] < data.field[0].length-1)
						ncells.push([cell[0]+1, cell[1]]);
					if (cell[1] < data.field.length-1)
						ncells.push([cell[0], cell[1]+1]);
					if (cell[0] > 0 && cell[1] > 0)
						ncells.push([cell[0]-1, cell[1]-1]);
					if (cell[0] > 0 && cell[1] < data.field.length-1)
						ncells.push([cell[0]-1, cell[1]+1]);
					if (cell[0] < data.field[0].length-1 && cell[1] > 0)
						ncells.push([cell[0]+1, cell[1]-1]);
					if (cell[0] < data.field[0].length-1 && cell[1] < data.field.length-1)
						ncells.push([cell[0]+1, cell[1]+1]);
				}
			}
			cells = ncells;
		}

		if (won(data))
			return 'won';
		return data.status;
	}

	// wtf
	return data.status;
}
function won(data) {
	for (let y = 0; y < data.open.length; ++y) {
		for (let x = 0; x < data.open[y].length; ++x) {
			if (data.open[y][x] == ' ')
				return false;
		}
	}
	return true;
}