const login = () => {
	let passwdInp = document.querySelector('#passwd');
	if (passwdInp.value) {
		axios
			.post('/api/login', { passwd: passwdInp.value })
			.then((res) => {
				if (res.data.success) {
					localStorage.setItem('token', res.data.token);
					window.location.href = '/';
				} else {
					alert('密码错误');
				}
			})
			.catch((err) => {
				console.log(err.message);
				document.cookie = 'Auth';
			});
	}
};

document.querySelector('#login').addEventListener('click', login);
