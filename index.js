const { ApolloServer } = require('@apollo/server')
const { ApolloServerErrorCode } = require('@apollo/server/errors')
const { GraphQLError } = require('graphql')
const { startStandaloneServer } = require('@apollo/server/standalone')
const mongoose = require('mongoose')
const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')
const jwt = require('jsonwebtoken')
require('dotenv').config()

mongoose.connect(process.env.MONGODB_URI).then(()=>console.log("connection started"))

const typeDefs = `#graphql
  type Author {
    id: ID!
    name: String!
    born: Int
    bookCount: Int!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type User {
    username: String!
    favouriteGenre: String!
    id: ID!
  }
  
  type Token {
    value: String!
  }

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
    me: User
  }

  type Mutation {
    addBook(
      title: String!
      author: String!
      published: Int!
      genres: [String!]!
    ): Book
    editAuthor(
      name: String!
      setBornTo: Int!
    ): Author
    createUser(
      username: String!
      favouriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }
`

const resolvers = {
  Query: {
    bookCount: () => Book.collection.countDocuments(),
    authorCount: () => Author.collection.countDocuments(),
    allBooks: async (root, args) => {
      if (!args.author && !args.genre) {
        const book = await Book.find({}).populate('author')
        return book
      }
      let filterObj = {}
      // if(args.author) filterObj = {author: {name: args.author}}
      if(args.genre) filterObj = {...filterObj, genres: {$in: [args.genre]}}
      const book = await Book.find(filterObj).populate('author')
      return book
    },
    allAuthors: () => authors.map(a => {
        return Author.find({})
    }),
    me: (root, args, {currentUser}) => currentUser
  },
  Author: {
    bookCount: ()=>null
  },
  Mutation: {
    addBook: async (root, args, {currentUser}) => {
      if(!currentUser) {
        throw new GraphQLError('User not logged in', {extensions:{code:'UNAUTHENTICATED'}})
      }
      let author = await Author.findOne({name:args.author})
      if(!author) {
        author = new Author({name:args.author})
        try {
          author = await author.save()
        } catch (error) {
          throw new GraphQLError(error.message, {
            extensions: {
              code: ApolloServerErrorCode.BAD_USER_INPUT,
              invalidArgs: args.author
            }
          })
        }
      }
      const book = new Book({ title:args.title, published:args.published, genres:args.genres, author:author._id })
      try {
        await book.save()
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: {
            code: ApolloServerErrorCode.BAD_USER_INPUT,
            invalidArgs: args.title
          }
        })
      }
      return book
    },
    editAuthor: async (root, args, {currentUser}) => {
      if(!currentUser) {
        throw new GraphQLError('User not logged in', {extensions:{code:'UNAUTHENTICATED'}})
      }
      const author = Author.findOne({name: args.name})
      if (!author) {
        return null
      }
      author = {...author, born: args.setBornTo}
      try {
        await author.save()
      } catch (error) {
        throw new GraphQLError(error.message, {
          extensions: {
            code: ApolloServerErrorCode.BAD_USER_INPUT,
            invalidArgs: args
          }
        })
      }
    },
    createUser: async (root, {username, favouriteGenre}) => {
      const user = new User({username, favouriteGenre})
      try {
        await user.save()
      } catch(error) {
        throw new GraphQLError(error.message, {
          extensions: {
            code: ApolloServerErrorCode.BAD_USER_INPUT,
            invalidArgs: {username, favouriteGenre}
          }
        })
      }
      return user;
    },
    login: async (root, {username, password}) => {
      const user = await User.findOne({username})

      if (!user || password !== 'secret') {
        throw new GraphQLError("wrong credentials", {
          extensions: {
            code: ApolloServerErrorCode.BAD_USER_INPUT
          }
        })
      }

      const userToken = {
        username: user.username,
        id: user._id
      }

      return { value: jwt.sign(userToken, process.env.JWT_KEY) }
    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ req }) => {
    const auth = req ? req.headers.authorization : null
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const decodedToken = jwt.verify(auth.substring(7), process.env.JWT_KEY)
      const currentUser = await User.findById(decodedToken.id)
      return {currentUser}
    }
  }
})

startStandaloneServer(server, {listen: {port: 4000}})
  .then(({ url }) => {
    console.log(`Server ready at ${url}`)})

