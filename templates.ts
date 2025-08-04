export interface Template {
    name: string;
    html: string;
    css: string;
    js: string;
}

export const templates: Template[] = [
    {
        name: 'Hello World',
        html: `<h1>Hello, World!</h1>
<p>Welcome to your first Pen.</p>`,
        css: `body {
    font-family: sans-serif;
    background-color: #f0f0f0;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
    margin: 0;
}

h1 {
    color: #333;
}`,
        js: `console.log('Hello from the JavaScript console!');`
    },
    {
        name: 'Login Form',
        html: `<div class="login-container">
    <h2>Login</h2>
    <form>
        <div class="input-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" required>
        </div>
        <div class="input-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" required>
        </div>
        <button type="submit">Login</button>
    </form>
</div>`,
        css: `body {
    font-family: Arial, sans-serif;
    background: #f4f4f9;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
}

.login-container {
    background: white;
    padding: 2rem;
    border-radius: 8px;
    box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    width: 300px;
}

h2 {
    text-align: center;
    color: #333;
    margin-bottom: 1.5rem;
}

.input-group {
    margin-bottom: 1rem;
}

.input-group label {
    display: block;
    margin-bottom: 0.5rem;
    color: #555;
}

.input-group input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
}

button {
    width: 100%;
    padding: 0.75rem;
    border: none;
    background: #007bff;
    color: white;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
}

button:hover {
    background: #0056b3;
}`,
        js: `const form = document.querySelector('form');

form.addEventListener('submit', (e) => {
    e.preventDefault();
    alert('Login form submitted!');
});`
    },
    {
        name: 'Product Card',
        html: `<div class="card">
  <img src="https://via.placeholder.com/300x200" alt="Product Image">
  <div class="card-content">
    <h3>Awesome Gadget</h3>
    <p>A truly amazing gadget that will change your life. High quality and built to last.</p>
    <div class="price">$99.99</div>
    <button>Add to Cart</button>
  </div>
</div>`,
        css: `body {
    background-color: #eef2f7;
    font-family: 'Helvetica Neue', sans-serif;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100vh;
}

.card {
    width: 300px;
    background-color: white;
    border-radius: 10px;
    box-shadow: 0 10px 20px rgba(0,0,0,0.1);
    overflow: hidden;
}

.card img {
    width: 100%;
    height: auto;
}

.card-content {
    padding: 20px;
}

.card-content h3 {
    margin-top: 0;
    font-size: 1.5em;
    color: #333;
}

.card-content p {
    color: #666;
    line-height: 1.6;
}

.price {
    font-size: 1.8em;
    font-weight: bold;
    color: #27ae60;
    margin: 15px 0;
}

.card-content button {
    width: 100%;
    padding: 12px;
    background-color: #3498db;
    color: white;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s ease;
}

.card-content button:hover {
    background-color: #2980b9;
}`,
        js: `const cartButton = document.querySelector('.card-content button');

cartButton.addEventListener('click', () => {
    alert('Added to cart!');
});`
    }
];
