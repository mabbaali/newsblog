require('dotenv').config()
const express = require('express')
const bodyparser = require('body-parser')
const ejs = require('ejs')
const mongoose = require('mongoose')
const session = require('express-session')
const passport = require('passport')
const passportLocalMongoose = require('passport-local-mongoose')
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const findOrCreate = require('mongoose-findorcreate')
const mail = require(__dirname+'/email.js')
const axios = require('axios')

const url1 = 'https://newsapi.org/v2/top-headlines?q=ng&apiKey='+process.env.API_KEY
const url2 = 'https://newsapi.org/v2/everything?q=ng&apiKey='+process.env.API_KEY


const app = express()
app.use(express.static('assets'))
app.use(bodyparser.urlencoded({extended:true}))
app.use(session({
  secret: 'jihcbe;wfwpefouwfw ;vwe',
  resave:false,
  saveUninitialized: false
}))
app.use(passport.initialize())
app.use(passport.session())
passport.use(new GoogleStrategy({
  clientID: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  callbackURL: "http://localhost:2001/auth/google/home"
},
function(accessToken, refreshToken, profile, cb) {
  User.findOrCreate({ googleId: profile.id }, function (err, user) {
    console.log(profile)
    return cb(err, user);
  });
}
));

mongoose.connect("mongodb+srv://"+process.env.MONGOOSE_USERNAME+":"+process.env.MONGOOSE_PASSWORD+"@cluster0.a9rmqtl.mongodb.net/newsDB")

const userschema = new mongoose.Schema({
  username: String,
  email: String,
  password: String,
  googleId: String
})

userschema.plugin(passportLocalMongoose);
userschema.plugin(findOrCreate);

const newsschema = new mongoose.Schema({
        source:String,
        author: String,
        title: String,
        description:String,
        publishedAt:Date,
        content:String,
        imageUrl:String,
}) 
const commentschema = new mongoose.Schema({
  user_comment: String,
  postId:String,
  user: userschema
})


const headlineNews = mongoose.model('headlineNews', newsschema)
const allNews = mongoose.model('allNews', newsschema)
const Comment = mongoose.model('comment', commentschema)
const User = mongoose.model('user', userschema)
passport.use(User.createStrategy())



const date = new Date()
var hour = date.getHours()

passport.serializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, {
      id: user.id,
      username: user.username,
      picture: user.picture
    });
  });
});

passport.deserializeUser(function(user, cb) {
  process.nextTick(function() {
    return cb(null, user);
  });
});


app.get('/auth/google',
  passport.authenticate('google', { scope: ['profile'] })
  
  );

app.get('/auth/google/home', 
  passport.authenticate('google', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/');
  });

app.get('/login', (req, res)=>{
  res.render('login.ejs')
})

app.get('/register', (req, res)=>{

  res.render('register.ejs')
})


app.post('/login', (req, res)=>{
  const user = new User({
    username: req.body.username,
    password: req.body.password
  })
  req.logIn(user, (err)=>{
    if(err){
      console.log(err)
    }else{
      passport.authenticate("local")(req, res, ()=>{
        res.redirect('/')
      })
    }
  })
   
})

app.get('/logout', function(req, res, next){
  req.logout(function(err) {
    if (err) { return next(err); }
    res.redirect('/login');
  });
});
app.post('/register', (req, res)=>{
  User.register({username:req.body.username, active:false}, req.body.password, (err, user)=>{
    if (err){
      console.log(err)
      res.redirect('/register')
    }else{
      passport.authenticate("local")(req, res, ()=>{
        res.redirect('/')
      })
    }
  })
   
})

if(hour==7){
  axios.all([
    axios.get(url1),
    axios.get(url2)
  ]).then(axios.spread((response1, response2) => {
    var articles = response1.data.articles
    var allArticles = response2.data.articles
    for (article of articles.slice(0, 5)){
    var newHeadlines = headlineNews({
        source: article.source.name,
        author: article.author,
        title: article.title,
        description: article.description,
        publishedAt: article.publishedAt,
        content: article.content,
        imageUrl: article.urlToImage
    })
        newHeadlines.save()
  }
  for (article of allArticles.slice(0, 11)){
    var allnews = allNews({
        source: article.source.name,
        author: article.author,
        title: article.title,
        description: article.description,
        publishedAt: article.publishedAt,
        content: article.content,
        imageUrl: article.urlToImage
    })
        allnews.save()
  }
  })).catch(error => {
    console.log(error);
  });
}

app.get('/',(req, res)=>{
  console.log(req.isAuthenticated())
    headlineNews.find({}, (err, data1)=>{
      allNews.find({}, (err, data2)=>{
        
       
        res.render('index.ejs', {data1: data1, data2:data2})
      })
    })
  })

app.post('/', (req, res)=>{
  mail.emailSender(req.body.eml)
  res.redirect('/')
})

commentList = []
 

app.get('/single-post:id', (req, res)=>{
  const id = req.params.id
  Comment.find({postId:id}, (err, commentData)=>{
    if(commentData){
      commentList = commentData
      console.log(commentList)
    }
  }) 
  allNews.findById({_id:id}, (err, data)=>{
    if(data){
    res.render('single-post.ejs', {data:data, isAuthenticated:req.isAuthenticated(), comments:commentList})
    }else{
    headlineNews.findById({_id:id}, (err,data)=>{
          res.render('single-post.ejs', {data:data, isAuthenticated:req.isAuthenticated(), comments:commentList})

    })
    }
  })
  
})

app.post('/single-post:id', (req, res)=>{
  const newcomment = Comment({
    user_comment:req.body.comment,
    user: req.user,
    postId:req.params.id
  })

  newcomment.save()
  res.redirect('single-post:id')

})

// api

app.get('/:p', (req, res)=>{
  parameter = req.params.p

    if(parameter == 'all-news'){
      allNews.find((err, news)=>{
        if(!err){
          res.send(news)
        }else{
          res.send(err)
        }
      })
    }else if(parameter=='headlines'){
      headlineNews.find((err, news)=>{
        if(!err){
          res.send(news)
        }else{
          res.send(err)
        }
      })
    }
})

app.post('/headlines', (req, res)=>{
  console.log(req.body)
 var title = req.body.title
  var description = req.body.description
  var source = req.body.source

  newheadlines = headlineNews({
    title: title,
    description: description,
    source: source
  })
  newheadlines.save()
  res.send(['successfully added'])
})


app.put('/headlines/:id',(req, res)=>{
  id = req.params.id
  console.log(id)
  const title = req.body.title
  const description = req.body.description
  const source = req.body.source

  headlineNews.updateOne({_id:id}, {title:title, description: description, source: source}, (err)=>{
    if(!err){
      res.send({'result': 'updated'})

    }
  })

})

app.patch('/headlines/:id',(req, res)=>{
  id = req.params.id

  const data = req.body
  headlineNews.updateOne({_id:id}, {$set:data}, (err)=>{
    if(!err){
      res.send({'result': 'updated'})

    }
  })

})

app.delete('/headlines/:id',(req, res)=>{
  id = req.params.id

  headlineNews.deleteOne({_id:id},(err)=>{
    if(!err){
      res.send({'result': 'deleted'})

    }
  })

})

app.delete('/headlines:apikey',(req, res)=>{
  apikey = req.params.apikey
  console.log(id)
    myKey = 'thisismyapikey'
  
    if (id == myKey){
      headlineNews.delete((err)=>{
        if(!err){
          res.send({'result': 'deleted all data'})
    
        }
      })
    }else{
      res.send({'result': 'you are not authorized'})
    }

})



app.listen(2001, ()=>{
    console.log('Running')
})