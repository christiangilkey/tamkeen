// swift-tools-version: 5.9
import PackageDescription

// Tamkeen's own iPhone code, packaged the way Capacitor expects a plugin so that
// `npx cap sync ios` adds it to the app by itself (see ../package.json: "tamkeen-native").
let package = Package(
    name: "TamkeenNative",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "TamkeenNative",
            targets: ["TamkeenNative"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "TamkeenNative",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/TamkeenNative")
    ]
)
