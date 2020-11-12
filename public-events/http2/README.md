# Public Events - HTTP2 Service

This public event service uses the HTTP2 protocol to broadcast events.  The response is a stream of newline json (application/x-ndjson) (http://ndjson.org/) messages containing subject URIs that are ready.

The default query looks like:

```bash
curl http://[hostname]/_/h2/[uri encoded subject match]
```

Ex:

```bash
# for file:///west/fulldisk/{{date}}/{{hour}}/{{min-sec}}/2/91/blocks/{{block}}/image.png
curl https://data.casita.library.ucdavis.edu/_/h2/file%3A%2F%2F%2Fwest%2Ffulldisk%2F%7B%7Bdate%7D%7D%2F%7B%7Bhour%7D%7D%2F%7B%7Bmin-sec%7D%7D%2F2%2F91%2Fblocks%2F%7B%7Bblock%7D%7D%2Fimage.png
```

## Shortcuts

To simplify the requested url for users, you can define shortcut routes in `/etc/krm/event-shortcuts.js`.

The `event-shortcuts.js` should export an object with keys being the route (shortcut) name and the value either:
  - A regex object to match to subject uri
  - A object that has a `test()` method which takes the subject uri string and returns true/false

Ex `event-shortcuts.js`:
```
module.exports = {
    'fulldisk-band2' : /^file:\/\/\/west\/fulldisk\/\d{4}-\d{2}-\d{2}\/\d{2}\/\d{2}-\d{2}\/2\/91\/blocks\/\d+-\d+\/image\.png$/
}
```

then:

```
curl https://data.casita.library.ucdavis.edu/_/h2/fulldisk-band2
```

## Response

On first connection the following is returned:

On Success:
```json
{
    "connected": true, 
    "subject": "[string|null]", 
    "shortcut" : "boolean"
}
```

On Failure:
```json
{
    "error": true,
    "path" : "[string]",
    "subject" : "[string|null]",
    "shortcut" : "[string|null]",
    "message" : "string"
}
```

After a successfull response, all subject uri matches are returned as
```json
{
    "subject" : "string"
}
```