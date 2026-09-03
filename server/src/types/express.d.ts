import 'express'

// `middleware/deviceIdentity.ts` sets this once a request passes
// validation — augmenting Express's own `Request` type is the standard
// way to make `req.deviceId` type-check at every route handler that
// runs after the middleware, instead of an `as`-cast at each call site.
declare module 'express-serve-static-core' {
  interface Request {
    deviceId?: string
  }
}
