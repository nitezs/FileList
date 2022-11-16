import fs, { createReadStream } from 'fs';
import express, { NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import jsonwebtoken from 'jsonwebtoken';
import { Request, Response } from 'express';
import { expressjwt } from 'express-jwt';
import morgan from 'morgan';

type FileType = {
	name: string;
	shortPath: string;
	path: string;
	isDir: boolean;
	modifiedTime: string;
	size: number;
	sizeStr: string;
};

const getFiles = (cpath: string) => {
	cpath = decodeURI(cpath);
	let list: FileType[] = [];
	if (fs.existsSync(cpath)) {
		if (cpath) {
			let l = fs.readdirSync(cpath);
			l.forEach((item) => {
				let stat = fs.statSync(path.join(cpath, item));
				let size = stat.size;
				let counter = 0;
				let unit = ['B', 'KB', 'MB', 'GB', 'TB', 'EB'];
				while (size > 1024) {
					size /= 1024;
					counter++;
				}
				list.push({
					name: item,
					shortPath: path.join(cpath, item).replace(process.env.ROOT ?? '', ''),
					path: path.join(cpath, item),
					isDir: stat.isDirectory(),
					modifiedTime: stat.mtime.toLocaleString(),
					size: stat.size,
					sizeStr: stat.isDirectory() ? '-' : size.toFixed(2) + unit[counter],
				});
			});
			return list;
		}
	} else {
		return null;
	}
};

const removeController = (req: Request, res: Response) => {
	let { spath } = req.body;
	let _path = path.join(process.env.ROOT ?? __dirname, spath);
	fs.rmSync(_path, { force: true, recursive: true });
	res.json({ success: true });
};

const getListController = (req: Request, res: Response) => {
	let { path } = req.body;
	res.json(getFiles(path));
};

const homePageController = (req: Request, res: Response) => {
	let _path = path.join(
		decodeURI(process.env.ROOT ?? __dirname),
		decodeURI(req.path ?? '/')
	);
	if (fs.existsSync(_path)) {
		if (fs.statSync(_path).isFile()) {
			let _ = _path.split(path.sep);
			let fileName = _[_.length - 1];
			res.set({
				'Content-type': 'application/octet-stream',
				'Content-Disposition': 'attachment;filename=' + encodeURI(fileName),
				'Content-Length': fs.statSync(_path).size,
			});
			let readStream = fs.createReadStream(_path);
			readStream.pipe(res);
		} else {
			let list = getFiles(_path);
			let paths = [];
			let link = '';
			for (let p of req.path.split('/')) {
				link += p + '/';
				paths.push({ path: p, link: link });
			}
			paths[0].path = '主页';
			if (list) {
				res.render('home', { list, path: paths });
			} else {
				res.sendStatus(404);
			}
		}
	}
};

const loginPageController = (req: Request, res: Response) => {
	if (req.auth) {
		return res.redirect('/');
	}
	res.render('login');
};

const loginActionController = (req: Request, res: Response) => {
	let { passwd } = req.body;
	if (passwd === process.env.PASSWD) {
		let token = jsonwebtoken.sign({ login: true }, 'nitezszs');
		res.cookie('token', token, { expires: new Date(2999, 1, 1) });
		res.json({ success: true, data: { token } });
	} else {
		res.send({ success: false });
	}
};

const startServer = (port: string) => {
	if (!port) {
		console.log('Missing parameters "PORT"');
		return;
	}
	const app = express();

	//中间件
	const getToken = (req: Request) => {
		return req.cookies.token ?? null;
	};
	app.use(morgan('common'));
	app.use(express.json());
	app.use(express.urlencoded({ extended: false }));
	app.use(cookieParser());
	const jwtVerify = expressjwt({
		secret: 'nitezszs',
		algorithms: ['HS256'],
		getToken,
	});
	const jwtVerifyNotRequired = expressjwt({
		secret: 'nitezszs',
		algorithms: ['HS256'],
		credentialsRequired: false,
		getToken,
	});

	//静态资源
	app.use(express.static(path.join(__dirname, 'dist')));

	//渲染引擎
	app.set('views', path.join(__dirname, 'views'));
	app.set('view engine', 'ejs');

	//路由
	app.get('/login', jwtVerifyNotRequired, loginPageController);
	app.post('/api/login', loginActionController);
	app.post('/api/list', jwtVerify, getListController);
	app.post('/api/mkDir', jwtVerify);
	app.post('/api/remove', jwtVerify, removeController);
	app.post('/api/rename', jwtVerify);
	app.post('/api/move', jwtVerify);
	app.get(/.*?/, jwtVerify, homePageController);

	//开始监听端口
	app.listen(Number.parseInt(port), () => {
		console.log(`Server is listening on http://localhost:${port}`);
	});

	//位置路由捕获
	app.use((req, res) => {
		res.send('404');
	});

	//未认证
	app.use((err: any, req: Request, res: Response, next: NextFunction) => {
		if (err.name === 'UnauthorizedError') {
			res.redirect('/login');
		}
	});
};

const main = () => {
	require('dotenv').config(); //加载配置文件
	startServer(process.env.PORT ?? '');
};

main();
