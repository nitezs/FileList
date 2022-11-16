const rm = (elem) => {
	axios
		.post('/api/remove', { spath: elem.getAttribute('data-path') })
		.then((res) => {
			elem.parentNode.remove();
		})
		.catch((err) => {
			console.log(err.message);
		});
};
