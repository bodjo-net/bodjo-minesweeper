bodjo.contextName = '2d';
bodjo.render = function (canvas, ctx, resizeCanvas, field, turn) {
	console.log(arguments)
	let height = field.length;
	let width = field[0].length;

	if (window.aspectRatio != (width / height))
		resizeCanvas(width / height);

	let s = canvas.width / width;
	ctx.imageSmoothingEnabled = (s < 16);
	for (let y = 0; y < height; ++y) {
		for (let x = 0; x < width; ++x) {
			renderCell(x, y, field[y][x], s, ctx);
		}
	}

	if (typeof turn === 'object' &&
		turn != null) {
		ctx.strokeStyle = 'red';
		ctx.lineWidth = 2 * window.devicePixelRatio;
		ctx.strokeRect(turn.coordinates[0] / width * canvas.width,
					   turn.coordinates[1] / height * canvas.height,
					   canvas.width / width,
					   canvas.height / height);
	}
};

var tiles = new Image();
tiles.src = '/tiles.png';
function renderCell(x, y, c, s, ctx) {
	var map = " F*012345678x";
	var X = map.indexOf(c) % 4;
	var Y = ((map.indexOf(c) - X) / 4);
	ctx.drawImage(tiles, X*(tiles.width/4), Y*(tiles.height/4), 
						 tiles.width/4, tiles.height/4, 
						 Math.ceil(x*s), Math.ceil(y*s), 
						 Math.ceil(s), Math.ceil(s));
}