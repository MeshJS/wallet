import sodium from "libsodium-wrappers-sumo";

// libsodium-wrappers-sumo initializes asynchronously; ensure it is ready
// before any dependency (e.g. @meshsdk/provider) loads a duplicate copy.
beforeAll(async () => {
  await sodium.ready;
});
