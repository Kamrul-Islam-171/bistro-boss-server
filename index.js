const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const express = require('express')
const cors = require('cors');
const app = express()
const port = process.env.PORT || 5000;
require('dotenv').config()
var jwt = require('jsonwebtoken');

const stripe = require("stripe")(process.env.STRIPE_SE_KEY);



app.use(express.json());
app.use(cors({
    origin: ['http://localhost:5173'],
    credentials: true,

}))



const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.insvee7.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

const verifyToken = (req, res, next) => {
    console.log('inside = ', req.headers.authorization);
    if (!req.headers.authorization) {
        // console.log('why i am here')

        return res.status(401).send({ message: 'Forbidden-Access' })
    }
    const token = req.headers.authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(401).send({ message: 'Forbidden-Access' });
        }
        req.decoded = decoded;
        // console.log('yes finally')
        next();
    });
    // next();
}


async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();
        // Send a ping to confirm a successful connection
        const menuCollection = client.db('BistroBoss').collection('Menu');
        const usersCollection = client.db('BistroBoss').collection('users');
        const cartCollection = client.db('BistroBoss').collection('Carts');
        const ReviewsCollection = client.db('BistroBoss').collection('Reviews');
        const paymentCollection = client.db('BistroBoss').collection('payment');

        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            const admin = user?.role === 'admin';
            if (admin === false) {
                return res.status(403).send({ message: 'forbidden access' })
            }
            next();
        }


        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '7h' });
            res.send({ token })
        })

        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result)
        })
        app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
            const menu = req.body;
            const result = await menuCollection.insertOne(menu);
            res.send(result);
        })

        app.patch('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const menu = req.body;
            console.log(menu);
            const query = { _id: id };
            const doc = {
                $set: { ...menu }
            }
            const result = await menuCollection.updateOne(query, doc);
            res.send(result);
        })
        app.get('/menu/:itemId', async (req, res) => {
            const id = req.params.itemId;
            // console.log('my id new = ', id)
            const query = {
                _id: id
            };
            const result = await menuCollection.findOne(query);
            // console.log(result)
            res.send(result)
        })
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            const query = { email: email }
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {

            const result = await usersCollection.find().toArray();
            res.send(result)
        })

        // app.get('/review/:id', async(req, res) => {
        //     const id = req.params.id;
        //     console.log(id)
        //     const query = {_id : id}
        //     const result = await ReviewsCollection.findOne(query);
        //     console.log(result)
        //     res.send(result);


        // })

        app.post("/create-payment-intent", async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            // console.log('price = ', amount)

            // Create a PaymentIntent with the order amount and currency
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: [
                    "card",
                ],

            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payment', async (req, res) => {
            const payment = req.body;

            const savePay = await paymentCollection.insertOne(payment);

            const ids = payment.cartIds.map(id => new ObjectId(id));

            const result = await cartCollection.deleteMany({ _id: { $in: ids } });
            console.log('delete all', result);

            res.send({ savePay, result })
        })

        app.get('/payment/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                return res.status(403).send({ message: 'Unauthorized' })
            }

            const query = { email };
            const result = await paymentCollection.find(query).toArray();

            res.send(result);

        })

        app.get('/admin-stats',verifyToken, async (req, res) => {
            const users = await usersCollection.estimatedDocumentCount();
            const menuItems = await menuCollection.estimatedDocumentCount();
            const orders = await paymentCollection.estimatedDocumentCount();
            console.log('i have a certain thisgs to do foy you')

            const result = await paymentCollection.aggregate([
                {
                    $group: {
                        _id: null,
                        totalRevenue: {
                            $sum: '$price'
                        }
                    }
                }
            ]).toArray()

            const revenue = result.length > 0 ? result[0].totalRevenue : '0'

            res.send({
                users,
                menuItems,
                orders,
                revenue
            })
        })




        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            // console.log('email = ', email)
            // console.log('de-email = ', req.decoded.email)
            if (email != req.decoded.email) {
                return res.status(401).send({ message: 'unauthorized-access' })
            }

            const query = { email: email };
            const user = await usersCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user.role === 'admin';
            }
            // console.log(admin)

            res.send({ admin })
        })

        app.post('/users', async (req, res) => {
            const data = req.body;
            const result = await usersCollection.insertOne(data);
            res.send(result);
        })


        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const result = await cartCollection.insertOne(cartItem);
            res.send(result);
        })


        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const doc = {
                $set: {
                    role: 'admin'
                }
            }

            const result = await usersCollection.updateOne(filter, doc);
            res.send(result)
        })



        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        })
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Bistro Boss!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})