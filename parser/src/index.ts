<<<<<<< before updating
export { parsePage } from '#parser'
export * from '#schemas'
||||||| last update
=======
import { err, ok, type Result } from 'neverthrow'
>>>>>>> after updating
<<<<<<< before updating
export * from '#types'
||||||| last update
export const greet = (name: string): string => {
  return `Hello, ${name}!`
}
=======
export const greet = (name: string): Result<string, Error> => {
  if (!name) return err(new Error('name must not be empty'))
  return ok(`Hello, ${name}!`)
}
>>>>>>> after updating
