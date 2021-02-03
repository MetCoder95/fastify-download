const { createReadStream, stat } = require('fs')
const { isAbsolute, join, basename } = require('path')
const { promisify } = require('util')
const ms = require('ms')
const { contentType } = require('mime-types')
const fp = require('fastify-plugin')
const statPromise = promisify(stat)

/**
 * Options:
 * maxAge - in seconds, max-age prop in Cache-Control
 * root - root directory for relative filenames (default to process.cwd)
 * lastModified - If true, pick the date from the OS of the file
 * allowDotfiles - boolean '.<name>' files
 * acceptRanges - enable Accept-Ranges: bytes header
 * cacheControl - enable/disable Cache-Control header
 * immutable - if true, sets immutable in Cache-Control, requires maxAge opt
 */

const DEFAULT_OPTIONS = {
  acceptRanges: true,
  allowDotfiles: false,
  cacheControl: true,
  maxAge: '0',
  lastModified: true,
  root: '',
  immutable: false
}

function getDownload (globalOptions) {
  const DOT_FILE_REGEX = /^\.[\w-]+/

  // Merge options passed with default ones in case partial options were passed
  globalOptions = globalOptions != null ? validateOptions(Object.assign(DEFAULT_OPTIONS, globalOptions)) : DEFAULT_OPTIONS

  // Main function
  return async function download (file, filename, options) {
    options = validateOptions(Object.assign({}, globalOptions, typeof filename === 'object' ? filename : options))
    filename = typeof filename === 'string' ? filename : basename(file)

    const { root, allowDotfiles } = options
    const path = validatePath(file, root, allowDotfiles)
    const fullPath = root ? join(root, path) : path
    const headers = getHeaders(filename, options)

    if (options.lastModified) {
      const { mtime } = await statPromise(fullPath)

      this.header('Last-Modified', mtime)
    }

    const stream = createReadStream(fullPath)

    this.headers(headers)

    return this.send(stream)
  }

  function validateOptions (options) {
    const { allowDotfiles, maxAge } = options

    if (typeof allowDotfiles !== 'boolean') {
      throw new Error(
        `'dotfiles' option only accepts 'deny' or 'allow'. Received ${allowDotfiles}`
      )
    }

    if (Number.isNaN(maxAge) && typeof maxAge !== 'string') {
      throw new Error("'maxAge' only accepts 'numeric' or 'string' values")
    }

    return options
  }

  function validatePath (file, root, allowDotfiles) {
    if (!isAbsolute(file) && !root) {
      throw new Error("'file' must be absolute or specify 'root'")
    }

    if (allowDotfiles || !DOT_FILE_REGEX.test(file)) {
      return file
    }

    throw new Error('dotfiles not allowed')
  }

  function getHeaders (filename, options) {
    const { acceptRanges, cacheControl, immutable, maxAge } = options
    const contentTypeHeader = contentType(filename)
    const maxAgeArg = maxAge == null ? 0 : maxAge
    const headers = {
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Type': contentTypeHeader
    }

    if (acceptRanges) headers['Accept-Ranges'] = 'bytes'
    if (cacheControl) {
      const maxAgeHeader = typeof maxAgeArg === 'number' ? maxAgeArg : ms(maxAgeArg)
      const immutableString = immutable && maxAge != null ? ', immutable' : ''
      headers['Cache-Control'] = `max-age=${maxAgeHeader}${immutableString}`
    }

    return headers
  }
}

function fastifyDownload (fastify, options, done) {
  const download = getDownload(options)

  fastify.decorateReply('download', download)

  done()
}

module.exports = fp(fastifyDownload, {
  fastify: '>=3.8',
  name: 'fastify-download'
})
