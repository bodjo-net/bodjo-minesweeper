bodjo.on('connect', function (socket) {
	socket.on('field', (username, field, data) => {
		bodjo.callRender(username, decodeField(field));
	});
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