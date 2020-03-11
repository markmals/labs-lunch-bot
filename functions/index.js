const { WebClient } = require("@slack/web-api")
const slack = new WebClient(
    "xoxb-21341612592-944350723799-Wp01I6EQk5LGPMeBYqVf6MhE"
)
const { Client } = require("@googlemaps/google-maps-services-js")
const maps = new Client({})
const functions = require("firebase-functions")
const admin = require("firebase-admin")

/**
 * Retrieves a random element from an array
 *
 * @param {*[]} array
 * @returns {*}
 */
const getRandomElement = array => {
    return array[Math.floor(Math.random() * array.length)]
}

exports.labslunchroulette = functions.pubsub
    .schedule("0 0 9 * * THU")
    .onRun(async () => {
        admin.initializeApp(functions.config().firebase)
        const db = admin.firestore()

        // Get the raw compiled data from the database as an array for a collection
        const generateJSONArray = async (collectionName, sort) => {
            if (!sort) sort = false
            const array = []
            const ref = db.collection(collectionName)
            const sortedRef = sort ? ref.orderBy("dateAdded", "asc") : ref
            const snapshot = await sortedRef.get()
            snapshot.forEach(doc => {
                const data = doc.data()
                data.id = doc.id
                array.push(data)
            })
            return array
        }

        // Array of Restaurant objects
        let restaurants = await generateJSONArray("restaurants")
        // Array of Restaurant objects
        let latest = await generateJSONArray("latest", true)

        // Remove restaurants that haven't yet been tested
        restaurants = restaurants.filter(restaurant => restaurant.tested)
        // Remove restaurants that we've gone to in the last 6 weeks
        restaurants = restaurants.filter(
            restaurant => !latest.map(rest => rest.id).includes(restaurant.id)
        )

        const pickOfTheWeek = getRandomElement(restaurants)
        const pickID = pickOfTheWeek.id
        // Remove the id field from the object we will push to the database
        delete pickOfTheWeek.id
        // Set the date added to the current time
        pickOfTheWeek.dateAdded = new admin.firestore.Timestamp(
            Math.round(new Date().getTime() / 1000),
            0
        )

        // Remove the oldest restaurant from latest if there are 6 restaurants in latest
        if (latest.length === 6)
            await db
                .collection("latest")
                .doc(latest[0].id)
                .delete()
        // Push our pick of the week to the database
        db.collection("latest")
            .doc(pickID)
            .set(pickOfTheWeek)

        // Get travel time from the Google Maps API
        const mapsResponse = await maps.distancematrix({
            params: {
                origins: [
                    {
                        latitude: 30.353312,
                        longitude: -97.749252
                    }
                ],
                destinations: [pickOfTheWeek.location],
                key: "AIzaSyAs_uQ3hkJEBBAi5xHQeEJeuSLxnFQzaPM"
            }
        })

        // Extract travel time from Google Maps response
        const timeToLunch = mapsResponse.data.rows[0].elements[0].duration.text
        const message = `It looks like it's time to go to lunch.\n\nI can help with that!\n    • We're going to ${pickOfTheWeek.name} this week\n    • Here's the menu: ${pickOfTheWeek.menu}\n    • It will take ${timeToLunch} to get there, by car`
        // Post the message to Slack
        await slack.chat.postMessage({
            channel: "labslunch",
            text: message
        })
    })
