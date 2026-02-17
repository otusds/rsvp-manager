from flask import Flask

app = Flask(__name__)

@app.route("/")
def home():
    return "<h1>RSVP Manager</h1><p>Bienvenue, this is a test 2.0!</p>"

if __name__ == "__main__":
    app.run(debug=True)