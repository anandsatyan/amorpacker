# Use the official Node.js base image
FROM node:14

# Install system dependencies, including ImageMagick and GraphicsMagick
RUN apt-get update && apt-get install -y \
    imagemagick \
    graphicsmagick

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json to the container
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Expose the port that the app will run on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
