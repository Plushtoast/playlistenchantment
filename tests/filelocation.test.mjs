import test from "node:test";
import assert from "node:assert/strict";

const endpoint = { protocol: "https:", host: "s3.us-east-1.amazonaws.com" };
const virtualHost = new RegExp(`^${endpoint.protocol}//(?<bucket>.*).${endpoint.host}/(?<key>.*)`);
const pathStyle = new RegExp(`^${endpoint.protocol}//${endpoint.host}/(?<bucket>[^/]+)/(?<key>.*)`);

globalThis.game = { data: { files: { s3: { endpoint } } } };
globalThis.foundry = {
    applications: {
        apps: {
            FilePicker: {
                implementation: {
                    matchS3URL(url) {
                        return virtualHost.exec(url) ?? pathStyle.exec(url) ?? null;
                    },
                },
            },
        },
    },
};

const { FileLocation } = await import("../modules/core/filelocation.js");

const BUCKET = "example-bucket";
const url = (key) => `https://${BUCKET}.${endpoint.host}/${key}`;

test("parses a virtual-host S3 URL", () => {
    const location = FileLocation.parse(url("audio/dungeon_synth/track.mp3"));
    assert.equal(location.source, "s3");
    assert.equal(location.bucket, BUCKET);
    assert.equal(location.target, "audio/dungeon_synth/track.mp3");
    assert.deepEqual(location.browseOptions, { bucket: BUCKET });
    assert.equal(location.name, "track.mp3");
});


test("parses a plain data path", () => {
    const location = FileLocation.parse("modules/playlistenchantment/storage/track.mp3");
    assert.equal(location.source, "data");
    assert.equal(location.bucket, null);
    assert.deepEqual(location.browseOptions, {});
    assert.equal(location.target, "modules/playlistenchantment/storage/track.mp3");
});

test("parse returns an existing FileLocation unchanged", () => {
    const location = FileLocation.parse(url("audio"));
    assert.equal(FileLocation.parse(location), location);
});

test("the S3 root normalizes to the empty string, never a slash", () => {
    const location = FileLocation.parse(url(""));
    assert.equal(location.source, "s3");
    assert.equal(location.target, "");
    assert.notEqual(location.target, "/");
    assert.equal(new FileLocation("s3", "/", BUCKET).target, "");
});


test("parent drops the last segment", () => {
    const location = new FileLocation("s3", "audio/dungeon_synth", BUCKET);
    const parent = location.parent();
    assert.equal(parent.target, "audio");
    assert.equal(parent.source, "s3");
    assert.equal(parent.bucket, BUCKET);
});

test("parent clamps at the root and never returns null", () => {
    const root = new FileLocation("s3", "audio", BUCKET).parent();
    assert.equal(root.target, "");
    const above = root.parent();
    assert.ok(above instanceof FileLocation);
    assert.equal(above.target, "");
});

test("contains is true for a descendant and for itself", () => {
    const root = new FileLocation("s3", "audio", BUCKET);
    assert.equal(root.contains(url("audio/dungeon_synth/track.mp3")), true);
    assert.equal(root.contains(url("audio")), true);
    assert.equal(root.contains(url("audiobooks/track.mp3")), false);
});

test("the empty root contains everything in its own bucket", () => {
    const root = new FileLocation("s3", "", BUCKET);
    assert.equal(root.contains(url("audio/track.mp3")), true);
});

test("contains is false across buckets and across sources", () => {
    const root = new FileLocation("s3", "audio", BUCKET);
    assert.equal(root.contains(new FileLocation("s3", "audio/track.mp3", "other-bucket")), false);
    assert.equal(root.contains(new FileLocation("data", "audio/track.mp3")), false);
    assert.equal(new FileLocation("data", "audio").contains(url("audio/track.mp3")), false);
});

test("join appends one segment and handles awkward names", () => {
    const root = new FileLocation("s3", "audio", BUCKET);
    assert.equal(root.join("dungeon synth #2").target, "audio/dungeon synth #2");
    assert.equal(new FileLocation("s3", "", BUCKET).join("audio").target, "audio");
    assert.equal(root.join("/nested/").target, "audio/nested");
});

test("toString round-trips back through parse", () => {
    const location = new FileLocation("s3", "audio/dungeon synth #2", BUCKET);
    assert.equal(location.toString(), url("audio/dungeon synth #2"));
    const reparsed = FileLocation.parse(location.toString());
    assert.equal(reparsed.equals(location), true);
    assert.equal(reparsed.target, location.target);
    assert.equal(reparsed.bucket, BUCKET);
});

test("toString on the S3 root ends at the bucket", () => {
    assert.equal(new FileLocation("s3", "", BUCKET).toString(), url(""));
    assert.equal(FileLocation.parse(url("")).equals(new FileLocation("s3", "", BUCKET)), true);
});



test("equals compares source, bucket and target", () => {
    const location = new FileLocation("s3", "audio", BUCKET);
    assert.equal(location.equals(new FileLocation("s3", "audio", BUCKET)), true);
    assert.equal(location.equals(new FileLocation("s3", "audio", "other")), false);
    assert.equal(location.equals(new FileLocation("data", "audio")), false);
    assert.equal(location.equals(new FileLocation("s3", "audio/x", BUCKET)), false);
});

test("compareKey preserves case for S3 and lowercases for data", () => {
    assert.equal(new FileLocation("s3", "Audio/Track.MP3", BUCKET).compareKey(), url("Audio/Track.MP3"));
    assert.equal(new FileLocation("data", "Audio/Track.MP3").compareKey(), "audio/track.mp3");
});

test("compareKey decodes percent escapes", () => {
    assert.equal(new FileLocation("data", "audio/My%20Track.mp3").compareKey(), "audio/my track.mp3");
    assert.equal(new FileLocation("data", "audio/100%.mp3").compareKey(), "audio/100%.mp3");
});

test("name decodes the last segment", () => {
    assert.equal(FileLocation.parse(url("audio/My%20Track.mp3")).name, "My Track.mp3");
    assert.equal(new FileLocation("s3", "", BUCKET).name, "");
});


test("a helper-shadowed data-path never resolves inside the upload root", () => {
    const root = new FileLocation("s3", "dev-audio", BUCKET);
    const corrupted = FileLocation.parse("/systems/ose/dist[object Object]");
    assert.equal(corrupted.source, "data");
    assert.equal(corrupted.target, "systems/ose/dist[object Object]");
    assert.equal(root.contains(corrupted), false);
    assert.equal(root.contains(""), false);
});

test("contains accepts the browse dirs the upload dialog renders as folders", () => {
    const root = new FileLocation("s3", "dev-audio", BUCKET);
    const child = new FileLocation(root.source, "dev-audio/Fogweaver", root.bucket);
    assert.equal(String(child), url("dev-audio/Fogweaver"));
    assert.equal(root.contains(String(child)), true);
    assert.equal(root.contains(FileLocation.parse(String(child))), true);
});
