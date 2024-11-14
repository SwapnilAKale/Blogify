const express = require("express");
const http = require("http");
const fs = require("fs");
const mongoose = require("mongoose");
const { Schema, model } = require("mongoose");
const path = require("path");
const multer = require("multer");
const shortId = require("shortid");
const { Server } = require("socket.io");

const app = express();
const port = 9000;
const server = http.createServer(app);
const io = new Server(server);

const uploadDir = path.resolve('./public/uploads');

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
      const fileName = `${Date.now()}-${file.originalname}`;
      cb(null, fileName);
    },
});
  
const upload = multer({ storage: storage });

app.set("view engine", "ejs");
app.set("views", path.resolve("./views"));

mongoose
    .connect("mongodb+srv://SwapnilKale:Swapnil1842@swapnilcluster.ik8qz.mongodb.net/Instagram")
    .then(() => console.log("MongoDB Connected"));

const likeSchema = new Schema({
    postId: {
        type: Schema.Types.ObjectId,
        ref: "user",
    },
    likes: { 
        type: Number, 
        default: 0 
    },
    likedBy: [{ 
        type: Schema.Types.ObjectId, 
        ref: 'user' 
    }]
}, { timestamps: true });

const userSchema = new Schema({
    username: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: true,
    },
    id: {
        type: String,
        unique: true,
    },
    aboutme: {
        type: String,
    },
    coverImageURL: {
        type: String,
    },
    createdTime: {
        type: String,
    }
}, { timestamps: true });

const Like = model("Like", likeSchema);
const User = model("User", userSchema);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.resolve("./public")));

io.on('connection', (socket) => {
    console.log('User connected');

    socket.on('like', async (data) => {
        const { postId, userId } = data;
        const objectId = new mongoose.Types.ObjectId(postId);
        
        let existingLike = await Like.findOne({ postId: objectId });

        if (!existingLike) {
            existingLike = new Like({
                postId: objectId,
                likes: 1,
                likedBy: [userId],
            });
            await existingLike.save();
        } else {
            if (existingLike.likedBy.includes(userId)) {
                existingLike.likes -= 1;
                existingLike.likedBy = existingLike.likedBy.filter(id => id.toString() !== userId);
            } else {
                existingLike.likes += 1;
                existingLike.likedBy.push(userId);
            }
            await existingLike.save();
        }

        io.emit('likeCounts', existingLike);
    });
});

app.get("/", (req, res) => {
    const error = req.query.error || '';
    res.render("userlogin", { error });
});

app
    .route("/signup")
    .get((req, res) => {
        const error = req.query.error || '';
        res.render("usersignup", { error });
    })
    .post(async (req, res) => {
        const { UserName, PassWord } = req.body;

        if (!UserName) return res.redirect("/signup?error=Username is required");
        if (!PassWord) return res.redirect("/signup?error=Password is required");

        const findingUser = await User.find({ username: UserName });
        if (findingUser.length > 0) return res.redirect("/signup?error=You already have an account");

        const Id = shortId();
        await User.create({
            username: UserName,
            password: PassWord,
            id: Id,
            coverImageURL: "",
        });
        res.redirect(`/Account?username=${UserName}`);
    });

app.post("/Delete", async (req, res) => {
    const USERNAME = req.query.username;
    const findingUser = await User.findOne({ username: USERNAME });

    if (findingUser) {
        await Like.deleteMany({ postId: findingUser._id });
        await User.findOneAndDelete({ username: USERNAME });
    }
    res.redirect("/");
});
    
app
    .route("/login")
    .post(async (req, res) => {
        const { UserName, PassWord } = req.body;

        if (!UserName) return res.redirect("/?error=Username is required");
        if (!PassWord) return res.redirect("/?error=Password is required");

        const userInfo = await User.find({ username: UserName });
        if (userInfo.length === 0) return res.redirect("/?error=Account Not Found");

        res.redirect(`/Account?username=${UserName}`);
    });

app.post("/Post", upload.single("coverImage"), async (req, res) => {
    const USERNAME = req.query.UserName;
    const body = req.body;
    const date = new Date();

    const UpdatedUser = await User.findOneAndUpdate({
        username: USERNAME,
    }, {
        coverImageURL: `/uploads/${req.file.filename}`,
        aboutme: body.AboutMe,
        createdTime: date.toDateString(),
    });

    if (UpdatedUser) {
        let updatedLikes = await Like.findOne({ postId: UpdatedUser._id });
    
        if (!updatedLikes) {
            const like = new Like({
                postId: UpdatedUser._id,
                likes: 0,
                likedBy: [],
            });
            await like.save();
        } else {
            updatedLikes.likedBy = [];
            updatedLikes.likes = 0;
            await updatedLikes.save();
        }
    }
    res.redirect(`/Account?username=${USERNAME}`);
});

app.get("/Account", async (req, res) => {
    const USERNAME = req.query.username;
    if (!USERNAME) return res.redirect("/login");

    const userInfo = await User.find({ username: USERNAME });
    const allUsers = await User.find({}).sort({ createdAt: -1 });
    const likess = await Like.find({}).sort({ createdAt: -1 });

    let posts = allUsers.some(user => user.coverImageURL !== '');

    res.render("Account", {
        USER: userInfo,
        alluser: allUsers,
        Post: posts,
        likess,
    });
});

app.get("/Posts", async (req, res) => {
    const USERNAME = req.query.username;
    const userInfo = await User.find({ username: USERNAME });
    res.render("Posts", { USER: userInfo });
});

app.get("/Profile", async (req, res) => {
    const USERNAME = req.query.username;
    const userInfo = await User.find({ username: USERNAME });
    res.render("Profile", { USER: userInfo });
});

app.get("/Logout", (req, res) => {
    res.redirect("/");
});

server.listen(port, () => console.log("Server Started at PORT", port));
