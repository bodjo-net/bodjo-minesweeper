var lib = require('./lib.js');
var fs = require('fs');
lib.init();

var levels = [
	{ // beginner
		width: 8,
		height: 8,
		mines: 10
	},
	{ // intermediate
		width: 16,
		height: 16,
		mines: 40
	},
	{ // expert
		width: 24,
		height: 24,
		mines: 99
	},
	{ // expert+
		width: 48,
		height: 48,
		mines: 460
	}
];

var scores = {};
if (fs.existsSync('scores.json'))
	scores = JSON.parse(fs.readFileSync('scores.json').toString());
function saveScores() {
	fs.writeFileSync('scores.json', JSON.stringify(scores));
}
function getScores() {
	var array = Array.from(Object.keys(scores), function (username) {
		return {level: scores[username], username};
	});
	array.sort(function (a, b) {
		return b.level - a.level;
	});

	var p = 0;
	for (var i = 0; i < array.length; ++i) {
		if (i > 0 && array[i-1].level != array[i].level)
			p++;
		array[i].place = p;
	}
	return array;
}

var playerData = {};
lib.on('connect', 'game', (player, message) => {
	var data = playerData[player.username];
	if (typeof data === 'undefined' ||
		typeof data.field === 'undefined' ||
		typeof data.opened === 'undefined' ||
		(typeof data === 'object' && data.status != 'playing')) {
		playerData[player.username] = data = {
			level: data?data.level||0:0,
			field: generateField(0),
			status: 'playing',
			opened: matrix(levels[0].height, levels[0].width, ' ')
		};
	}
	
	var sentScoreboard = false;
	if (typeof scores[player.username] !== 'number') {
		scores[player.username] = -1;
		saveScores();
		sentScoreboard = true;
		lib.broadcast('score', {scoreboard: getScores()});
	}
	if (!message && !sentScoreboard)
		player.send('score', {scoreboard: getScores()});

	if (rightMessage(message, data)) {
		let turnResult = doTurn(data, message);
		if (turnResult.result == 'defeat') {
			let fullField = mix(data.field, data.opened);
			fullField[turnResult.mine.y][turnResult.mine.x] = '*';
			data.opened = fullField;
			data.status = 'defeat';
		} else if (turnResult.result == 'win') {
			data.status = 'win';
			if (data.level > scores[player.username]) {
				scores[player.username] = data.level;
				saveScores();
				lib.broadcast('score', {scoreboard: getScores()});
			}
		}
	}

	player.send('game', {status: data.status, field: data.opened, level: data.level});
});
lib.on('repeat', (player, message) => {
	var data = playerData[player.username];
	if (typeof data === 'undefined')
		playerData[player.username] = data = { level: 0 };

	data.field = generateField(data.level);
	data.opened = matrix(levels[data.level].height, levels[data.level].width, ' ');
	data.status = 'playing';

	player.send('game', {status: data.status, field: data.opened, level: data.level});	
});
lib.on('level', (player, message) => {
	var data = playerData[player.username];
	if (typeof data === 'undefined')
		playerData[player.username] = data = { level: 0 };

	if (Number.isInteger(message.level) &&
		message.level >= 0 && message.level < levels.length)
		data.level = message.level;
	
	data.field = generateField(data.level);
	data.opened = matrix(levels[data.level].height, levels[data.level].width, ' ');
	data.status = 'playing';

	player.send('game', {status: data.status, field: data.opened, level: data.level});
});


function matrix(h, w, x) {
	return Array(h).fill().map(()=>Array(w).fill().map(()=>x));
}
function hasWon(data) {
	var field = data.field;
	var opened = data.opened;
	for (let y = 0; y < field.length; ++y)
		for (let x = 0; x < field[y].length; ++x)
			if (field[y][x] != 'x' && opened[y][x] != field[y][x])
				return false;
	return true;
}

function generateField(level) {
	let levelSettings = levels[level];
	let field = matrix(levelSettings.height, levelSettings.width, '0');
	for (let m = 0; m < levelSettings.mines; ++m) {
		let mineCoordinates = null;
		while (mineCoordinates == null || 
			   field[mineCoordinates.y][mineCoordinates.x] != '0') {
			mineCoordinates = {x: Math.round(Math.random()*(levelSettings.width-1)), 
							   y: Math.round(Math.random()*(levelSettings.height-1))};
		}
		field[mineCoordinates.y][mineCoordinates.x] = 'x';
	}

	for (let y = 0; y < field.length; ++y) {
		for (let x = 0; x < field[y].length; ++x) {
			if (field[y][x] == 'x') 
				continue;
			field[y][x] = minesAround(field, y, x).toString();
		}
	}
	return field;
}
function minesAround(field, Y, X) {
	let count = 0;
	for (let y = Y-1; y <= Y+1; ++y) {
		if (y < 0 || y >= field.length) continue;
		for (let x = X-1; x <= X+1; ++x) {
			if (x < 0 || x >= field[y].length) continue;
			if (x == X && y == Y) continue;

			if (field[y][x] == 'x')
				count++;
		}
	}
	return count;
}
function mix(a, b) {
	let c = matrix(a.length, a[0].length, undefined);
	for (let y = 0; y < a.length; ++y)
		for (let x = 0; x < a[y].length; ++x)
			c[y][x] = a[y][x] == ' ' ? b[y][x] : a[y][x];
	return c;
}
function doTurn(data, message) {
	let action = message.data.action;
	let coors =  message.data.coordinates;
	let symbol = data.field[coors[1]][coors[0]];
	let viewedSymbol = data.opened[coors[1]][coors[0]];
	
	if (action == 'mark') {
		if (viewedSymbol == ' ')
			data.opened[coors[1]][coors[0]] = 'F';
		else if (viewedSymbol == 'F')
			data.opened[coors[1]][coors[0]] = ' ';
		return {result: 'ok'};
	}

	if (symbol == 'x') {
		return {result: 'defeat', mine: {
			y: coors[1],
			x: coors[0]
		}};
	} else if ("012345678".indexOf(symbol) >= 0) {
		if (symbol == "0") {
			var cells = [coors];
			while (cells.length > 0) {
				var ncells = [];
				for (let cell of cells) {
					if (data.opened[cell[1]][cell[0]] != ' ')
						continue;
					let s = data.field[cell[1]][cell[0]];
					data.opened[cell[1]][cell[0]] = s;
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
			if (hasWon(data))
				return {result: 'win'};
			return {result: 'ok'};
		} else {
			data.opened[coors[1]][coors[0]] = symbol;
			if (hasWon(data))
				return {result: 'win'};
			return {result: 'ok'};
		}
	} else {
		// wtf
		return {result: 'err'};	
	}
}
function rightMessage(message, data) {
	return (typeof message === 'object' && 
			typeof message.data === 'object' &&
			typeof message.data.action === 'string' &&
			Array.isArray(message.data.coordinates) && 
			["open","mark"].indexOf(message.data.action) >= 0 &&
			message.data.coordinates.length == 2 &&
			Number.isInteger(message.data.coordinates[0]) &&
			Number.isInteger(message.data.coordinates[1]) &&
			message.data.coordinates[0] >= 0 && message.data.coordinates[1] >= 0 &&
			message.data.coordinates[0] < data.field[0].length &&
			message.data.coordinates[1] < data.field.length);
}