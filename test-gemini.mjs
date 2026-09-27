const models = ['gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-pro', 'gemini-1.0-pro'];
async function req() {
    for (const m of models) {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}`);
        console.log(`${m}: ${res.status}`);
    }
}
req();
