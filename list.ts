import fs, { createReadStream } from 'fs';
import express, { NextFunction, urlencoded } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import jsonwebtoken from 'jsonwebtoken';
import { Request, Response } from 'express';
import { expressjwt } from 'express-jwt';
import morgan from 'morgan';
import child_procss from 'child_process';
import { randomInt } from 'crypto';

let mime: { [x: string]: string };

let downloadList: DownloadItem[] = [];

type DownloadItem = {
	path: string;
	id: string;
	expires: Date;
};

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
	if (fs.existsSync(_path)) {
		if (process.platform === 'win32') {
			fs.rmSync(_path, { force: true, recursive: true });
		} else {
			child_procss.exec('rm -rf ' + _path, (err) => {
				console.log(err);
			});
		}

		res.json({ success: true });
	} else {
		res.sendStatus(404);
	}
};

const randomStr = (length: number) => {
	let t = 'ABCDEFGHJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890';
	let res = '';
	do {
		res = '';
		for (let i = 0; i < length; i++) {
			res = res.concat(t[randomInt(0, t.length - 1)]);
		}
	} while (existInDownloadList(res));
	return res;
};

const existInDownloadList = (str: string) => {
	for (let e of downloadList) {
		if (e.id === str) {
			return true;
		}
	}
	return false;
};

const getDownloadId = (path: string) => {
	for (let e of downloadList) {
		if (e.path === path) {
			if (e.expires.getTime() < new Date().getTime()) {
				//到期了
				e.id = randomStr(10);
				let date = new Date();
				date.setHours(date.getHours() + 1);
				e.expires = date;
				//保存
				fs.writeFileSync('./ids.json', JSON.stringify(downloadList));
				return e.id;
			} else {
				return e.id;
			}
		}
	}
	let date = new Date();
	let id = randomStr(10);
	date.setHours(date.getHours() + 1);
	downloadList.push({
		path: path,
		id: id,
		expires: date,
	});

	//保存
	fs.writeFileSync('./ids.json', JSON.stringify(downloadList));

	return id;
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
			//返回下载文件
			sendFile(_path, req, res);
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

const getDownloadLinkController = (req: Request, res: Response) => {
	let { spath } = req.body;
	if (spath) {
		let id = getDownloadId(spath as string);
		res.json({
			success: true,
			data: {
				link: '/api/download?id=' + id,
			},
		});
	} else {
		res.sendStatus(500);
	}
};

const sendFile = (_path: string, req: Request, res: Response) => {
	let range = req.headers.range;
	let stat = fs.statSync(_path);
	let extname = path.extname(_path).substring(1);
	let basename = encodeURI(path.basename(_path));
	if (!fs.existsSync(_path)) {
		return res.sendStatus(404);
	}
	if (!range) {
		if (fs.existsSync(_path)) {
			let headers = {
				'Content-Range': `bytes 0-${stat.size - 1}/${stat.size}`,
				'Accept-Ranges': 'bytes',
				'Content-Type': mime[extname] ?? 'application/octet-stream',
				'Content-Disposition': 'attachment; filename="' + basename + '"',
				'Content-Length': stat.size,
			};
			res.writeHead(206, headers);
			let readStream = fs.createReadStream(_path);
			readStream.pipe(res);
		}
	} else {
		let r = range.replace('bytes=', '').split('-');
		let start = parseInt(r[0]);
		let end = r[1] ? parseInt(r[1]) : stat.size - 1;
		let chunksize = end - start + 1;
		let headers = {
			'Content-Range': `bytes ${start}-${end}/${stat.size}`,
			'Accept-Ranges': 'bytes',
			'Content-Type': mime[extname] ?? 'application/octet-stream',
			'Content-Disposition': 'attachment; filename="' + basename + '"',
			'Content-Length': chunksize,
		};
		res.writeHead(206, headers);
		let readStream = fs.createReadStream(_path, { start, end });
		readStream.pipe(res);
	}
};

const downloadController = (req: Request, res: Response) => {
	let { id } = req.query;
	let exist = false;
	if (id) {
		for (let e of downloadList) {
			if (id === e.id && e.expires.getTime() > new Date().getTime()) {
				exist = true;
				let _path = path.join(process.env.ROOT ?? __dirname, e.path);
				sendFile(_path, req, res);
			}
		}
		if (!exist) {
			res.sendStatus(404);
		}
	} else {
		res.sendStatus(404);
	}
};

declare global {
	namespace Express {
		interface Request {
			auth: any;
		}
	}
}

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
	app.use(morgan('combined')); //请求日志
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
	app.post('/api/remove', jwtVerify, removeController);
	app.post('/api/getId', jwtVerify, getDownloadLinkController);
	app.get('/api/download', downloadController);
	//app.post('/api/mkDir', jwtVerify);
	//app.post('/api/rename', jwtVerify);
	//app.post('/api/move', jwtVerify);
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
	mime = JSON.parse(
		fs.readFileSync(path.join(__dirname, './mime.json')).toString()
	);
	if (fs.existsSync('./ids.json')) {
		downloadList = JSON.parse(fs.readFileSync('./ids.json').toString());
		for (let e of downloadList) {
			if (typeof e.expires == 'string') {
				e.expires = new Date(e.expires);
			}
		}
	}
	require('dotenv').config(); //加载配置文件
	startServer(process.env.PORT ?? '');
};

main();
