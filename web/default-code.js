/*
	здесь могут быть ваши функции, константы, переменные.
	данный код запускается один раз
*/

return function onTick(field) {

	// эта функция запускается каждый ход

	// TODO: ваш код :)
	// сейчас этот код открывает случайные ячейки

	return {
		action: 'open',
		coordinates: [
			round(random() * (field[0].length-1)),
			round(random() * (field.length-1))
		]
	};
};