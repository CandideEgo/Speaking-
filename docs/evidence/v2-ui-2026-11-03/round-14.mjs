const spaces = await listTaskSpaces();
console.log(spaces.map((s) => ({ id: s.id, name: s.name, ownership: s.ownership })));
