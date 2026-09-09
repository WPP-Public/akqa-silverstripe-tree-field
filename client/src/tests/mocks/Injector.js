// Stands in for the CMS dependency injector while testing
const Injector = {
  ready: jest.fn((fn) => fn()),
  component: {
    register: jest.fn(),
    registerMany: jest.fn(),
    get: jest.fn(),
  },
};

export default Injector;
export const loadComponent = (component) => component;
