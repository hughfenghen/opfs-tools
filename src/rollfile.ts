import { file } from './file';

export function rollfile(filePath: string, maxSize: number) {
  let f = file(filePath);

  let size = 0;
  let writerPromise: ReturnType<typeof f.createWriter> = f.createWriter();
  let readerPromise = f.createReader();

  const reset = async (writer: Awaited<typeof writerPromise>) => {
    const reader = await readerPromise;
    const data = await reader.read(size, { at: Math.round(size * 0.3) });
    size = await writer.write(data, { at: 0 });
    await writer.truncate(size);
  };

  return {
    append: async (content: string) => {
      const writer = await writerPromise;
      size += await writer.write(content);
      if (size >= maxSize) await reset(writer);
    },
    text: f.text.bind(f),
    remove: async () => {
      await (await readerPromise).close();
      await (await writerPromise).close();
      await f.remove();
    },
    getSize: async () => size,
  };
}
