# TechMart Demo Store

A simple e-commerce application built for demonstrating software testing concepts.

## Features

- Product listing with filtering and sorting
- Shopping cart functionality
- User registration and login
- Checkout process
- RESTful API

## Setup

```bash
cd sample-app
npm install
npm start
```

The app will run on http://localhost:3000

## Demo Credentials

- Email: demo@techmart.com
- Password: demo123

## API Endpoints

### Products
- `GET /api/products` - Get all products (supports query params: category, search, minPrice, maxPrice)
- `GET /api/products/:id` - Get single product

### Cart
- `GET /api/cart` - Get cart contents
- `POST /api/cart` - Add item to cart (body: { productId, quantity })
- `PUT /api/cart/:productId` - Update cart item quantity
- `DELETE /api/cart/:productId` - Remove item from cart
- `DELETE /api/cart` - Clear cart

### Auth
- `POST /api/login` - Login (body: { email, password })
- `POST /api/register` - Register (body: { name, email, password })
- `POST /api/logout` - Logout
- `GET /api/user` - Get current user

### Checkout
- `POST /api/checkout` - Place order (body: { shipping: { address, city, zip, ... } })

### Health
- `GET /api/health` - Health check endpoint
