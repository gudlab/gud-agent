# Knowledge Base

> Auto-generated from https://expressjs.com on 2026-02-21
> 5 pages crawled

## Express - Node.js web application framework

<!-- Source: https://expressjs.com/ -->

Fast, unopinionated, minimalist web framework for Node.js
$ npm install express --save
const express = require('express')
const app = express()
const port = 3000
app.get('/', (req, res) => {
res.send('Hello World!')
})
app.listen(port, () => {
console.log(`Example app listening on port ${port}`)
})
[email protected]: Now the Default on npm with LTS Timeline
Express 5.1.0 is now the default on npm, and we’re introducing an official LTS schedule for the v4 and v5 release lines. Check out our latest blog for more information.
Web Applications Express is a minimal and flexible Node.js web application framework that provides a robust set of features for web and mobile applications.
APIs With a myriad of HTTP utility methods and middleware at your disposal, creating a robust API is quick and easy.
Performance Express provides a thin layer of fundamental web application features, without obscuring Node.js features that you know and love.
Middleware
Express is a lightweight and flexible routing framework with minimal core features
meant to be augmented through the use of Express middleware modules.

---

## Installing Express

<!-- Source: https://expressjs.com/en/starter/installing.html -->

Assuming you’ve already installed Node.js, create a directory to hold your application, and make that your working directory.
Express 4.x requires Node.js 0.10 or higher.
Express 5.x requires Node.js 18 or higher.
Use the npm init command to create a package.json file for your application.
For more information on how package.json works, see Specifics of npm’s package.json handling.
This command prompts you for a number of things, such as the name and version of your application.
For now, you can simply hit RETURN to accept the defaults for most of them, with the following exception:
Enter app.js, or whatever you want the name of the main file to be. If you want it to be index.js, hit RETURN to accept the suggested default file name.
Now, install Express in the myapp directory and save it in the dependencies list. For example:
To install Express temporarily and not add it to the dependencies list:
$ npm install express --no-save
By default with version npm 5.0+, npm install adds the module to the dependencies list in the package.json file; with earlier versions of npm, you must specify the --save option explicitly. Then, afterwards, running npm install in the app directory will automatically install modules in the dependencies list.
Next: Express "Hello World" example
Edit this page

---

## Express

<!-- Source: https://expressjs.com/en/starter/hello-world.html -->

Hello world example
Embedded below is essentially the simplest Express app you can create. It is a single file app — not what you’d get if you use the Express generator, which creates the scaffolding for a full app with numerous JavaScript files, Jade templates, and sub-directories for various purposes.
const express = require('express')
const app = express()
const port = 3000
app.get('/', (req, res) => {
res.send('Hello World!')
})
app.listen(port, () => {
console.log(`Example app listening on port ${port}`)
})
This app starts a server and listens on port 3000 for connections. The app responds with “Hello World!” for requests
to the root URL (/) or route. For every other path, it will respond with a 404 Not Found.
Running Locally
First create a directory named myapp, change to it and run npm init. Then, install express as a dependency, as per the installation guide.
In the myapp directory, create a file named app.js and copy the code from the example above.
The req (request) and res (response) are the exact same objects that Node provides, so you can invoke
req.pipe(), req.on('data', callback), and anything else you would do without Express involved.
Run the app with the following command:
Then, load http://localhost:3000/ in a browser to see the output.
Previous: Installing Express
Next: Express application generator
Edit this page

---

## Express application generator

<!-- Source: https://expressjs.com/en/starter/generator.html -->

Use the application generator tool, express-generator, to quickly create an application skeleton.
You can run the application generator with the npx command (available in Node.js 8.2.0).
For earlier Node versions, install the application generator as a global npm package and then launch it:
$ npm install -g express-generator
$ express
Display the command options with the -h option:
$ express -h
Usage: express [options] [dir]
Options:
-h, --help output usage information
--version output the version number
-e, --ejs add ejs engine support
--hbs add handlebars engine support
--pug add pug engine support
-H, --hogan add hogan.js engine support
--no-view generate without view engine
-v, --view <engine> add view <engine> support (ejs|hbs|hjs|jade|pug|twig|vash) (defaults to jade)
-c, --css <engine> add stylesheet <engine> support (less|stylus|compass|sass) (defaults to plain css)
--git add .gitignore
-f, --force force on non-empty directory
For example, the following creates an Express app named myapp. The app will be created in a folder named myapp in the current working directory and the view engine will be set to Pug:
$ express --view=pug myapp
create : myapp
create : myapp/package.json
create : myapp/app.js
create : myapp/public
create : myapp/public/javascripts
create : myapp/public/images
create : myapp/routes
create : myapp/routes/index.js
create : myapp/routes/users.js
create : myapp/public/stylesheets
create : myapp/public/stylesheets/style.css
create : myapp/views
create : myapp/views/index.pug
create : myapp/views/layout.pug
create : myapp/views/error.pug
create : myapp/bin
create : myapp/bin/www
Then install dependencies:
On MacOS or Linux, run the app with this command:
$ DEBUG=myapp:* npm start
On Windows Command Prompt, use this command:
> set DEBUG=myapp:* & npm start
On Windows PowerShell, use this command:
PS> $env:DEBUG='myapp:*'; npm start
Then, load http://localhost:3000/ in your browser to access the app.

---

## Express basic routing

<!-- Source: https://expressjs.com/en/starter/basic-routing.html -->

Routing refers to determining how an application responds to a client request to a particular endpoint, which is a URI (or path) and a specific HTTP request method (GET, POST, and so on).
Each route can have one or more handler functions, which are executed when the route is matched.
Route definition takes the following structure:
app.METHOD(PATH, HANDLER)
Where:
app is an instance of express.
METHOD is an HTTP request method, in lowercase.
PATH is a path on the server.
HANDLER is the function executed when the route is matched.
This tutorial assumes that an instance of express named app is created and the server is running. If you are not familiar with creating an app and starting it, see the Hello world example.
The following examples illustrate defining simple routes.
Respond with Hello World! on the homepage:
app.get('/', (req, res) => {
res.send('Hello World!')
})
Respond to a POST request on the root route (/), the application’s home page:
app.post('/', (req, res) => {
res.send('Got a POST request')
})
Respond to a PUT request to the /user route:
app.put('/user', (req, res) => {
res.send('Got a PUT request at /user')
})
Respond to a DELETE request to the /user route:
app.delete('/user', (req, res) => {
res.send('Got a DELETE request at /user')
})
For more details about routing, see the routing guide.
Previous: Express application generator
Next: Serving static files in Express
Edit this page

---
