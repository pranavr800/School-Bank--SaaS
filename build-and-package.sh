#!/bin/bash

# Define variables
BUILD_DIR="build"
PACKAGE_NAME="school-bank-package-$(date +%Y-%m-%d_%H-%M-%S).zip"

# Clean previous builds
echo "Cleaning previous builds..."
rm -rf $BUILD_DIR/*

# Build the application (placeholder for actual build command)
echo "Building the application..."
# Example: mvn clean package (uncomment and modify as needed)
# mvn clean package

# Check if build was successful
if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
fi

# Package the build into a zip file
echo "Packaging the build into $PACKAGE_NAME..."
zip -r $PACKAGE_NAME $BUILD_DIR/*

# Check if packaging was successful
if [ $? -eq 0 ]; then
    echo "Packaging successful: $PACKAGE_NAME"
else
    echo "Packaging failed!"
    exit 1
fi
