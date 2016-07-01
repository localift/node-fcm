"use strict"

const backoff = require("backoff")
const request = require("superagent")
const debug = require("debug")("fcm")

const API_URL = "https://fcm.googleapis.com/fcm/send"

function makeInstance(apiKey) {
  return sendPayload.bind(null, apiKey)
}

function makeRequest(apiKey, payload) {
  return request
    .post(API_URL)
    .send(payload)
    .set({
      Authorization: `key=${apiKey}`,
      "Content-Type": "application/json"
    })
}

function sendPayload(apiKey, payload) {
  return new Promise((resolve, reject) => {
    const b = backoff.exponential({
      randomisationFactor: 0,
      initialDelay: 1000,
      maxDelay: 64000,
      randomisationFactor: 1
    })

    b.failAfter(10)

    b.on("backoff", (number, delay) => {
      debug(`Backoff triggered: ${number} ${delay}ms`)
    })

    b.on("ready", (number, delay) => {
      makeRequest(apiKey, payload)
        .then(res => {
          const body = res.body

          resolve(res)
        }, err => {
          const res = err.response
          const body = res.body
          const status = res.status

          if (status === 401) {
            reject(err)
            return
          }

          if (res.header["retry-after"]) {
            debug(res.header["retry-after"])

            const diff = +(new Date(res.header["retry-after"])) - Date.now()

            debug(`Waiting ${diff}ms before next attempt`)

            setTimeout(() => b.backoff(), diff)
            return
          }
        })
    });

    b.on("fail", (err) => {
      if (err) {
        return reject(err)
      } else {
        return reject(new Error("Maximum number of backoffs reached"))
      }

    });

    b.backoff()
  })
}

module.exports = makeInstance
