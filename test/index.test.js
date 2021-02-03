'use strict'
const mock = require('mock-fs')
const tap = require('tap')
const test = tap.test
// const stream = require('stream')
const Fastify = require('fastify')
const plugin = require('..')

mock({
  'path/to/file.png': Buffer.from('Hello-world')
})

test('Should set a decorate reply with download function', (t) => {
  t.plan(14)
  const server = Fastify()
  server.register(plugin, {})

  server.register(
    function (fastifyInstance, opts, next) {
      // GET
      fastifyInstance.get('/string', (req, reply) => {
        t.isNotEqual(reply.download, undefined)
        t.strictEqual(String(reply.download), '[object Promise]')

        return 'Some string'
      })

      // POST
      fastifyInstance.post('/input', (req, reply) => {
        t.isNotEqual(reply.download, undefined)
        t.strictEqual(String(reply.download), '[object Promise]')
        return { foo: 'bar' }
      })

      fastifyInstance.register(
        function (fInstance, opts, next2) {
          // Nested GET
          fInstance.get('/buffer', (req, reply) => {
            t.isNotEqual(reply.download, undefined)
            t.strictEqual(String(reply.download), '[object Promise]')

            return Buffer.from('Hello World')
          })

          next2()
        },
        {
          prefix: '/with'
        }
      )

      next()
    },
    { prefix: '/api' }
  )

  server.inject({ method: 'GET', url: '/api/string' }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.strictEqual(res.body, 'Some string')
  })

  server.inject({ method: 'POST', url: '/api/input' }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    t.deepEqual(res.json(), { foo: 'bar' })
  })

  server.inject({ method: 'GET', url: '/api/with/buffer' }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
  })
})

test('Should send a file with Content-Disposition', (t) => {
  t.plan(14)
  const server = Fastify()
  server.register(plugin, {})

  server.register(
    function (fastifyInstance, opts, next) {
      // GET
      fastifyInstance.get('/image', (req, reply) => {
        return reply.download('path/to/file.png')
      })

      next()
    },
    { prefix: '/api' }
  )

  server.inject({ method: 'GET', url: '/api/image' }, (err, res) => {
    t.error(err)
    t.strictEqual(res.statusCode, 200)
    console.log(res.headers)
  })
})
