const rm = (elem) => {
	let r = window.confirm('确定删除文件(夹)?');
	if (r) {
		axios
			.post('/api/remove', { spath: elem.getAttribute('data-path') })
			.then((res) => {
				elem.parentNode.parentNode.remove();
			})
			.catch((err) => {
				console.log(err.message);
			});
	}
};

const gd = (elem) => {
	axios
		.post('/api/getId', { spath: elem.getAttribute('data-path') })
		.then((res) => {
			navigator.clipboard.writeText(
				window.location.origin + res.data.data.link
			);
		})
		.catch((err) => {
			console.error(err);
		});
};
